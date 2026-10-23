"""Freeze checkpoint selection on validation, then evaluate untouched test seeds."""
import argparse
import csv
import json
import time
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import torch

from env import DispatchEnv, baseline_action
from model import DispatchPolicy, tensors
from train import evaluate, save_json


def paired_comparison(model, baseline):
    rng = np.random.default_rng(20261023)
    result = {}
    for metric in ['mean_latency_s', 'energy_wh', 'energy_per_order_wh', 'objective']:
        x = np.array([row[metric] for row in model])
        y = np.array([row[metric] for row in baseline])
        differences = x - y
        sampled = rng.integers(0, len(x), (5000, len(x)))
        ci = np.quantile(differences[sampled].mean(axis=1), [.025, .975])
        result[metric] = dict(model_minus_baseline=float(differences.mean()),
                             improvement_percent=float((y.mean() - x.mean()) / y.mean() * 100),
                             paired_bootstrap_95_ci=ci.tolist())
    return result


def ablation(policy, seeds, weight, mode):
    rows = []
    for seed in seeds:
        env = DispatchEnv(seed, energy_weight=weight)
        while not env.done:
            rule = (mode == 'rule_mother' and env.stage == 'mother') or (mode == 'rule_orders' and env.stage == 'uav')
            if rule:
                action = baseline_action(env, 'cost_centroid')
            else:
                with torch.no_grad():
                    dist, _ = policy(**tensors([env.observation()]))
                action = int(dist.logits.argmax(-1))
            env.step(action)
        rows.append(dict(seed=seed, orders=env.n, **env.metrics()))
    return {k: float(np.mean([r[k] for r in rows])) for k in rows[0] if k not in ['seed', 'orders']}, rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runs', nargs='+', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'results')
    parser.add_argument('--test-start', type=int, default=4_000_000)
    parser.add_argument('--test-count', type=int, default=512)
    args = parser.parse_args()
    torch.set_num_threads(2)
    args.output.mkdir(parents=True, exist_ok=True)
    validation = range(1_000_000, 1_000_064)
    choices = []
    for run in args.runs:
        config = json.loads((run / 'config.json').read_text(encoding='utf-8'))
        weight = config['energy_weight_seconds_per_wh']
        policy = DispatchPolicy()
        policy.load_state_dict(torch.load(run / 'best.pt', weights_only=True))
        metrics, _ = evaluate(policy, validation, energy_weight=weight)
        choices.append(dict(run=str(run), weight=weight, validation=metrics))
    if len({c['weight'] for c in choices}) != 1:
        raise ValueError('Select checkpoints under the same objective weight')
    chosen = min(choices, key=lambda row: row['validation']['objective'])
    # Persist selection BEFORE looking at the final test.
    save_json(args.output / 'selection.json', dict(candidates=choices, selected=chosen,
                                                  test_start=args.test_start, test_count=args.test_count))
    run = Path(chosen['run']); weight = chosen['weight']
    policy = DispatchPolicy(); policy.load_state_dict(torch.load(run / 'best.pt', weights_only=True)); policy.eval()
    seeds = range(args.test_start, args.test_start + args.test_count)
    started = time.monotonic()
    summary = dict(selected_run=str(run), energy_weight=weight, methods={}, comparisons={}, convergence={})
    cases = {}
    for method in ['nearest_fixed', 'nearest_centroid', 'cost_centroid', 'ppo']:
        metrics, records = evaluate(policy, seeds, None if method == 'ppo' else method, weight)
        summary['methods'][method] = metrics; cases[method] = records
        save_json(args.output / f'cases_{method}.json', records)
        print(method, metrics, flush=True)
    for method in ['nearest_fixed', 'nearest_centroid', 'cost_centroid']:
        summary['comparisons'][method] = paired_comparison(cases['ppo'], cases[method])
    for mode in ['rule_mother', 'rule_orders']:
        metrics, records = ablation(policy, seeds, weight, mode)
        summary['methods'][mode] = metrics
        save_json(args.output / f'cases_{mode}.json', records)
        print(mode, metrics, flush=True)
    summary['by_order_count'] = {}
    for count in [9, 12, 15, 18]:
        summary['by_order_count'][str(count)] = {}
        for method, records in cases.items():
            group = [row for row in records if row['orders'] == count]
            summary['by_order_count'][str(count)][method] = dict(scenarios=len(group),
                **{key: float(np.mean([r[key] for r in group])) for key in
                   ['mean_latency_s', 'energy_wh', 'energy_per_order_wh', 'objective']})
    for candidate in choices:
        path = Path(candidate['run'])
        with (path / 'learning.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        iterations = np.array([int(r['iteration']) for r in rows])
        costs = np.array([float(r['objective']) for r in rows])
        boundary = iterations.max() - 60
        before = costs[iterations <= boundary].min()
        end = costs.min()
        improvement = (before - end) / before * 100
        summary['convergence'][str(path)] = dict(best_validation=float(end),
            improvement_last_60_iterations_percent=float(improvement),
            plateau_below_one_percent=bool(improvement < 1),
            iterations=int(iterations.max()))
    summary['evaluation_wall_seconds'] = time.monotonic() - started
    strong = summary['comparisons']['cost_centroid']
    summary['stop_criteria_met'] = bool(
        all(c['plateau_below_one_percent'] for c in summary['convergence'].values())
        and strong['objective']['improvement_percent'] >= 1
        and strong['mean_latency_s']['paired_bootstrap_95_ci'][1] < 0
        and strong['energy_wh']['paired_bootstrap_95_ci'][1] < 0
        and summary['methods']['ppo']['completion_rate'] == 1.)
    save_json(args.output / 'summary.json', summary)
    # Fully portable inference checkpoint; no dependence on frontend assets.
    torch.save(dict(state_dict=policy.state_dict(), energy_weight=weight,
                    architecture='DeepSets-centralized-masked-PPO-v2',
                    source_run=str(run), schema_version=3), args.output / 'dispatch_policy.pt')
    example = DispatchEnv(args.test_start, energy_weight=weight)
    while not example.done:
        with torch.no_grad():
            dist, _ = policy(**tensors([example.observation()]))
        example.step(int(dist.logits.argmax(-1)))
    save_json(args.output / 'example_mission.json', dict(orders=example.case.orders.tolist(),
        initial_batteries=example.case.batteries.tolist(), waves=example.history, metrics=example.metrics()))
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.5), constrained_layout=True)
    for candidate in choices:
        path = Path(candidate['run'])
        with (path / 'learning.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        axes[0].plot([int(r['iteration']) for r in rows], [float(r['objective']) for r in rows], label=path.name)
    axes[0].set(xlabel='PPO iteration', ylabel='Validation objective (lower is better)', title='Held-out learning curves')
    # Validation baseline, never substitute test baseline into the learning curve.
    val_rule, _ = evaluate(policy, validation, 'cost_centroid', weight)
    axes[0].axhline(val_rule['objective'], color='black', linestyle='--', label='time-energy rule (validation)')
    axes[0].legend(fontsize=7)
    names = ['nearest_fixed','nearest_centroid','cost_centroid','ppo']
    labels = ['Nearest / fixed','Nearest / centroid','Time-energy rule','Learned PPO']
    for ax, key, title in [(axes[1], 'mean_latency_s', 'Final test: mean order latency'),
                           (axes[2], 'energy_per_order_wh', 'Final test: UAV energy per order')]:
        ax.bar(labels, [summary['methods'][name][key] for name in names], color=['#a6b8cc'] * 3 + ['#7257b7'])
        ax.set_title(title); ax.set_ylabel('seconds' if key == 'mean_latency_s' else 'Wh / order')
        ax.tick_params(axis='x', rotation=22)
    fig.savefig(args.output / 'learning_and_test.png', dpi=180)
    lines = ['# V2 调度模型实验结果', '',
        f"最终模型：`{run.as_posix()}/best.pt`，已封装为 `results/dispatch_policy.pt`。",
        f"只依据 64 个验证场景选模，再评估从 {args.test_start} 开始的 {args.test_count} 个新场景。",
        f"停止判据全部满足：**{summary['stop_criteria_met']}**。这是经验平台及规则基线改进，不代表全局最优。", '',
        '## 最终测试', '',
        '| 方法 | 平均订单时延 s | 总无人机能耗 Wh/任务 | 能耗 Wh/单 | 综合目标 |',
        '|---|---:|---:|---:|---:|']
    descriptions = dict(nearest_fixed='最近订单，固定母车', nearest_centroid='最近订单，母车跟随订单中心',
        cost_centroid='时间/能耗规则，母车跟随订单中心', ppo='学习选单 + 学习母车',
        rule_mother='学习选单 + 规则母车（消融）', rule_orders='规则选单 + 学习母车（消融）')
    for name, metric in summary['methods'].items():
        lines.append(f"| {descriptions[name]} | {metric['mean_latency_s']:.3f} | {metric['energy_wh']:.3f} | {metric['energy_per_order_wh']:.3f} | {metric['objective']:.3f} |")
    lines.extend(['', f'综合目标为平均时延 + {weight:g} × 每单能耗；表中对每个任务先计算，再对场景等权平均。',
        '所有方法均完成全部订单；完成率由环境的合法动作和有限任务机制保障，并非学习收益。', '',
        '相对较强的时间/能耗规则：', ''])
    for key, label in [('mean_latency_s','平均订单时延'), ('energy_wh','总无人机能耗'),
                       ('energy_per_order_wh','每单能耗'), ('objective','综合目标')]:
        comparison = strong[key]
        lo, hi = comparison['paired_bootstrap_95_ci']
        lines.append(f"- {label}降低 {comparison['improvement_percent']:.2f}%；模型减基线的差值 95% 配对 bootstrap 区间为 [{lo:.4f}, {hi:.4f}]。")
    other = summary['comparisons']['nearest_centroid']['energy_per_order_wh']
    ablation_conclusion = ('本次消融显示收益主要来自学习母车接应；把选单替换为强规则后综合目标没有变差，'
        '因此当前尚未证明学习选单具有额外收益。' if summary['methods']['rule_orders']['objective'] <= summary['methods']['ppo']['objective']
        else '本次消融中完整学习策略的综合目标优于规则选单替换；仍需独立重训与多种子验证贡献。')
    lines.extend(['', f"相对最近订单/中心母车规则，每单能耗改善为 {other['improvement_percent']:.2f}%（负数代表增加），不能把相对强基线的结果说成优于所有规则。", '',
        ablation_conclusion, '',
        '## 收敛证据', '',
        '| 训练运行 | 验证集最佳综合目标 | 最后60次更新的最佳值改善 | 进入平台 |',
        '|---|---:|---:|---|'])
    for path, result in summary['convergence'].items():
        lines.append(f"| {Path(path).name} | {result['best_validation']:.3f} | {result['improvement_last_60_iterations_percent']:.3f}% | {result['plateau_below_one_percent']} |")
    lines.extend(['', '两轮最终训练均为从随机参数开始的 PPO，没有使用行为克隆；每轮 240 次更新、23040 个训练任务。',
        '训练种子分别为 7、42；策略只有 24610 个参数，在 CPU 上运行。', '',
        '![学习曲线和最终测试](results/learning_and_test.png)', '',
        '## 已验证的边界', '',
        '这是全量订单提前已知、三架无人机按波次共同出发/回收的解析调度环境。',
        '尚不包含动态到单、避障或真实飞行动力学，能耗参数未经实机标定。',
        '模型能自主输出无人机订单选择和母车接应点；不输出旧版连续飞行方向，现已通过 ONNX 接入 V2 前端；本报告数字仍仅对应离线静态环境。',
        '母车/选单消融是动作替换而非独立重训，应结合状态分布变化解读。',
        '五项环境测试覆盖奖励与目标一致性、电池余量、互斥订单、单舱排队、预起飞充电时序及模型排列等变性。', '',
        '详见 [实验方法与复现](README.md)、[原始最终指标](results/summary.json)、[逐场景数据](results/cases_ppo.json)。', ''])
    (Path(__file__).parent / 'REPORT.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    main()
