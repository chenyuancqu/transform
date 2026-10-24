import React from 'react';

const STAGES = {ready:'准备开始',preflight:'分批补能与起飞',executing:'滚动取件与接应',regrouping:'并行归位与下一单准备',waitingOrders:'等待新订单到达',complete:'本轮已完成',scopeComplete:'本次范围已完成'};
const fixed = (n, digits=1) => Number.isFinite(n) ? n.toFixed(digits) : '—';

export function V2WaveSummary({state}) {
  const plan = state.dispatch;
  return <section className="v2-wave-summary" aria-label="PPO 波次调度">
    <div><strong>V2 · PPO 协同调度</strong><span>第 {plan.wave || '—'} 波</span></div>
    <p>{!state.running&&plan.stage==='executing'?'已暂停 · ':''}{STAGES[plan.stage] || '等待调度'}{plan.pendingCommand ? ' · 新调度待下波生效' : ''}</p>
    <small>{plan.rendezvous ? `接应点 ${plan.site} · X ${fixed(plan.rendezvous[0],0)} / Y ${fixed(plan.rendezvous[1],0)} m` : '模型将在开始后选择订单与接应点'}</small>
    <div className="v2-assignment-list">{plan.assignments.map(a => <span key={`${a.uavId}-${a.orderId}`}>UAV {a.uavId}<b>→</b>订单 {a.orderId}</span>)}</div>
    <small className="v2-scope-note">{plan.fixedOrders?`固定 ${state.orders.length} 单`:`已到达 ${state.orders.length} / ${plan.orderStream?.maxOrders ?? 30} 单 · 每 12 仿真秒补单`} · 保持接应点滚动补派，交付完成后再切换</small>
  </section>;
}

export function V2Diagnostics({state}) {
  const plan = state.dispatch;
  return <div className="diagnostics console-card v2-diagnostics">
    <div className="diagnostics-title"><strong>V2 · PPO 离散调度</strong><span className="trace-status">ONNX / LIVE</span></div>
    <p>共享策略选择接应点和订单；飞行、悬停与卸货由后端执行。</p>
    <div className="algorithm-summary"><b>{state.health.inferenceCount ?? 0}</b><span>模型决策</span><b>{fixed(state.health.inferenceMs,2)}<em>ms</em></b><span>最近波次</span><b>{plan.wave}</b><span>当前波次</span></div>
    <div className="v2-model-contract"><span>全订单集合输入</span><code>{plan.observationShape}</code><span>输出：9 选 1 接应点 / 待取订单索引</span></div>
    <div className="algorithm-grid">{plan.decisions.map((d,index) => <section className="algorithm-row" key={index}>
      <div className="algorithm-row-head"><strong>{d.stage==='mother'?'MOTHER':`UAV ${d.uavId}`}</strong><span>{d.validActions} 个可选动作</span></div>
      <b className="v2-selected-action">{d.stage==='mother'?`接应点 ${d.action+1}`:`订单 ${d.orderId ?? d.action+1}`}</b>
      {d.candidates.map(c => <div className="v2-score" key={c.action}><span>{c.label}</span><progress max="1" value={c.probability}/><b>{fixed(c.probability*100,1)}%</b></div>)}
    </section>)}</div>
    {!plan.decisions.length && <p>开始任务后显示真实模型的候选动作评分。</p>}
    <div className="v2-live-metrics"><span>本轮实际飞行能耗 <b>{fixed(state.stats.uavEnergyWh,2)} Wh</b></span><span>目标权重 <b>时延 + 6 × Wh/单</b></span></div>
    <p className="v2-adaptation-note">{plan.adaptation}。此处显示园区执行实测，不套用离线训练改善比例。</p>
    <div className="diagnostic-events">{state.events.slice(-5).map((e,i)=><small key={i}>{fixed(e.time)}s · {e.text}</small>)}</div>
  </div>;
}
