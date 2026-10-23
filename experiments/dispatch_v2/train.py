"""CPU PPO, explicit heuristic warm start, held-out validation and final test."""
import argparse
import csv
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F

from env import DispatchEnv, baseline_action
from model import DispatchPolicy, tensors


def evaluate(policy, seeds, method=None, energy_weight=2.):
    records = []
    policy.eval()
    for seed in seeds:
        env = DispatchEnv(int(seed), energy_weight=energy_weight)
        while not env.done:
            if method:
                action = baseline_action(env, method)
            else:
                with torch.no_grad():
                    dist, _ = policy(**tensors([env.observation()]))
                action = int(dist.logits.argmax(-1).item())
            env.step(action)
        records.append(dict(seed=int(seed), orders=env.n, **env.metrics()))
    policy.train()
    return {key: float(np.mean([r[key] for r in records])) for key in records[0] if key not in ['seed', 'orders']}, records


def warm_start(policy, rng, episodes, epochs, energy_weight):
    if episodes <= 0 or epochs <= 0:
        return
    observations, actions = [], []
    for _ in range(episodes):
        env = DispatchEnv(int(rng.integers(0, 1_000_000)), energy_weight=energy_weight)
        while not env.done:
            observations.append(env.observation())
            action = baseline_action(env, 'cost_centroid')
            actions.append(action)
            env.step(action)
    batch = tensors(observations)
    labels = torch.tensor(actions)
    optimizer = torch.optim.Adam(policy.parameters(), lr=.001)
    for _ in range(epochs):
        for ix in torch.randperm(len(actions)).split(256):
            dist, _ = policy(**{k: v[ix] for k, v in batch.items()})
            loss = F.nll_loss(dist.logits, labels[ix])
            optimizer.zero_grad(); loss.backward(); optimizer.step()


def rollout(policy, rng, episodes, energy_weight):
    obs, actions, logprobs = [], [], []
    scores = []
    # Batch environments to avoid tiny single-state inference overhead.
    envs = [DispatchEnv(int(rng.integers(0, 1_000_000)), energy_weight=energy_weight) for _ in range(episodes)]
    trajectories = [[] for _ in envs]
    while any(not e.done for e in envs):
        active = [i for i, e in enumerate(envs) if not e.done]
        states = [envs[i].observation() for i in active]
        with torch.no_grad():
            distribution, value = policy(**tensors(states))
            action = distribution.sample()
            logprob = distribution.log_prob(action)
        for j, i in enumerate(active):
            reward = envs[i].step(int(action[j]))
            trajectories[i].append((states[j], int(action[j]), float(logprob[j]), float(value[j]), reward, envs[i].done))
    advantages = []
    returns = []
    for env, trajectory in zip(envs, trajectories):
        gae = 0.
        local_adv = []
        for i in reversed(range(len(trajectory))):
            _, _, _, value, reward, done = trajectory[i]
            next_value = trajectory[i + 1][3] if not done else 0.
            delta = reward + next_value - value
            gae = delta + .95 * gae * (not done)
            local_adv.append(gae)
        local_adv.reverse()
        advantages.extend(local_adv)
        returns.extend([a + t[3] for a, t in zip(local_adv, trajectory)])
        for o, a, lp, v, r, done in trajectory:
            obs.append(o); actions.append(a); logprobs.append(lp)
        scores.append(env.metrics()['objective'])
    advantage = torch.tensor(advantages, dtype=torch.float32)
    return tensors(obs), torch.tensor(actions), torch.tensor(logprobs), (advantage - advantage.mean()) / (advantage.std() + 1e-8), torch.tensor(returns, dtype=torch.float32), float(np.mean(scores))


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--iterations', type=int, default=160)
    parser.add_argument('--episodes', type=int, default=64)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--warm-episodes', type=int, default=256)
    parser.add_argument('--warm-epochs', type=int, default=8)
    parser.add_argument('--energy-weight', type=float, default=2.)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'runs' / 'ppo_v1')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.manual_seed(args.seed); np.random.seed(args.seed); random.seed(args.seed)
    rng = np.random.default_rng(args.seed)
    policy = DispatchPolicy()
    validation = range(1_000_000, 1_000_064)
    test = range(2_000_000, 2_000_256)
    config = vars(args).copy(); config['output'] = str(args.output)
    config.update(torch=torch.__version__, device='cpu', observation_schema=2, environment_schema=3,
                  energy_weight_seconds_per_wh=args.energy_weight,
                  training_seed_range=[0,999999], validation_seed_range=[1000000,1000063], test_seed_range=[2000000,2000255])
    save_json(args.output / 'config.json', config)
    start = time.monotonic()
    records = []
    initial, _ = evaluate(policy, validation, energy_weight=args.energy_weight)
    print('Random initialized validation', initial, flush=True)
    save_json(args.output / 'initial.json', initial)
    warm_start(policy, rng, args.warm_episodes, args.warm_epochs, args.energy_weight)
    warm, _ = evaluate(policy, validation, energy_weight=args.energy_weight)
    print('After imitation warm start' if args.warm_episodes and args.warm_epochs else 'No imitation warm start', warm, flush=True)
    torch.save(policy.state_dict(), args.output / 'warm_start.pt')
    save_json(args.output / 'warm_start.json', warm)
    optimizer = torch.optim.Adam(policy.parameters(), lr=3e-4)
    best = warm['objective']
    best_iteration = 0
    torch.save(policy.state_dict(), args.output / 'best.pt')
    for iteration in range(1, args.iterations + 1):
        batch, actions, old_lp, advantages, returns, train_score = rollout(policy, rng, args.episodes, args.energy_weight)
        losses, entropies, kls = [], [], []
        for epoch in range(4):
            for ix in torch.randperm(len(actions)).split(256):
                dist, value = policy(**{k: v[ix] for k, v in batch.items()})
                lp = dist.log_prob(actions[ix])
                ratio = (lp - old_lp[ix]).exp()
                actor_loss = -torch.minimum(ratio * advantages[ix], ratio.clamp(.8, 1.2) * advantages[ix]).mean()
                critic_loss = F.mse_loss(value, returns[ix])
                entropy = dist.entropy().mean()
                entropy_weight = .015 + .025 * max(0, 1 - iteration / args.iterations)
                loss = actor_loss + .5 * critic_loss - entropy_weight * entropy
                optimizer.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(policy.parameters(), .5); optimizer.step()
                losses.append(float(loss.detach())); entropies.append(float(entropy.detach()))
                kls.append(float(((ratio - 1) - (lp - old_lp[ix])).mean().detach()))
            if np.mean(kls[-max(1, len(actions)//256):]) > .03:
                break
        if iteration == 1 or iteration % 5 == 0:
            metrics, _ = evaluate(policy, validation, energy_weight=args.energy_weight)
            row = dict(iteration=iteration, train_objective=train_score, **metrics,
                       loss=float(np.mean(losses)), entropy=float(np.mean(entropies)),
                       kl=float(np.mean(kls)), wall_seconds=time.monotonic() - start)
            records.append(row)
            if metrics['objective'] < best:
                best = metrics['objective']; best_iteration = iteration
                torch.save(policy.state_dict(), args.output / 'best.pt')
            with (args.output / 'learning.csv').open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(row)); writer.writeheader(); writer.writerows(records)
            print(f"iter {iteration:3d} train {train_score:.2f} val {metrics['objective']:.2f} latency {metrics['mean_latency_s']:.2f} energy/order {metrics['energy_per_order_wh']:.2f} entropy {row['entropy']:.3f} best {best:.2f} wall {row['wall_seconds']:.0f}s", flush=True)
    torch.save(policy.state_dict(), args.output / 'last.pt')
    policy.load_state_dict(torch.load(args.output / 'best.pt', weights_only=True))
    results = dict(best_iteration=best_iteration, wall_seconds=time.monotonic() - start, methods={})
    for method in ['nearest_fixed', 'nearest_centroid', 'cost_centroid', 'ppo']:
        metrics, cases = evaluate(policy, test, None if method == 'ppo' else method, args.energy_weight)
        results['methods'][method] = metrics
        save_json(args.output / f'test_{method}.json', cases)
        print('TEST', method, metrics, flush=True)
    save_json(args.output / 'results.json', results)


if __name__ == '__main__':
    main()
