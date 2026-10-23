"""Export the trained dispatch actor to CPU ONNX; verify masked scores."""
from pathlib import Path
import hashlib
import json
import numpy as np
import onnxruntime as ort
import torch
from env import DispatchEnv
from model import DispatchPolicy, tensors


class RuntimeActor(torch.nn.Module):
    def __init__(self, policy):
        super().__init__()
        self.policy = policy

    def forward(self, orders, global_features, candidates, mask):
        distribution, value = self.policy(orders, global_features, candidates, mask)
        return distribution.logits, value


if __name__ == '__main__':
    torch.set_num_threads(2)
    root = Path(__file__).resolve().parent
    checkpoint = torch.load(root / 'results/dispatch_policy.pt', weights_only=True)
    policy = DispatchPolicy()
    policy.load_state_dict(checkpoint['state_dict'])
    actor = RuntimeActor(policy.eval()).eval()
    batch = tensors([DispatchEnv(4, energy_weight=6).observation()])
    target = root.parents[1] / 'frontend/backend/models/dispatch_v2.onnx'
    target.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(actor, tuple(batch.values()), target, input_names=list(batch),
                      output_names=['log_scores', 'value'], opset_version=17, dynamo=False)
    session = ort.InferenceSession(str(target), providers=['CPUExecutionProvider'])
    maximum = 0.
    for seed in range(16):
        env = DispatchEnv(seed, energy_weight=6)
        for _ in range(2):
            data = tensors([env.observation()])
            with torch.no_grad():
                expected, _ = actor(**data)
            actual = session.run(None, {k: v.numpy() for k, v in data.items()})[0]
            valid = data['mask'].numpy()
            maximum = max(maximum, float(np.max(np.abs(actual[valid] - expected.numpy()[valid]))))
            assert np.argmax(actual) == int(expected.argmax())
            env.step(int(expected.argmax()))
    assert maximum < 1e-4, maximum
    metadata = dict(policy='V2 PPO', architecture='DeepSets centralized masked discrete actor',
        source_checkpoint_sha256=hashlib.sha256((root / 'results/dispatch_policy.pt').read_bytes()).hexdigest(),
        energy_weight=checkpoint['energy_weight'], environment_schema=checkpoint['schema_version'],
        inputs={'orders':[1,18,8],'global_features':[1,36],'candidates':[1,18,16],'mask':[1,18]},
        outputs={'log_scores':[1,18],'value':[1]}, verified_decisions=32,max_valid_score_error=maximum)
    target.with_suffix('.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print(f'Exported {target}; max valid-score error {maximum:.8f}; 32 decisions identical')
