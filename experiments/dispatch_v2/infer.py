"""Replay one new mission using the selected discrete scheduling policy."""
import argparse
import json
from pathlib import Path
import torch
from env import DispatchEnv
from model import DispatchPolicy, tensors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', type=Path, default=Path(__file__).parent / 'results' / 'dispatch_policy.pt')
    parser.add_argument('--seed', type=int, default=5_000_000)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    torch.set_num_threads(2)
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=True)
    if checkpoint['schema_version'] != 3:
        raise ValueError('Unsupported observation/action schema')
    model = DispatchPolicy(); model.load_state_dict(checkpoint['state_dict']); model.eval()
    env = DispatchEnv(args.seed, energy_weight=checkpoint['energy_weight'])
    while not env.done:
        with torch.no_grad():
            distribution, _ = model(**tensors([env.observation()]))
        env.step(int(distribution.logits.argmax(-1)))
    result = dict(seed=args.seed, orders=env.case.orders.tolist(), waves=env.history, metrics=env.metrics())
    if args.output:
        args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result['metrics'], indent=2))


if __name__ == '__main__':
    main()
