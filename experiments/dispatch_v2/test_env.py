import unittest
import numpy as np
import torch

from env import DispatchEnv, Scenario, baseline_action, MAX_ACTIONS
from model import DispatchPolicy, tensors


class DispatchInvariants(unittest.TestCase):
    def test_reward_exactly_matches_latency_energy_objective(self):
        for seed in range(30):
            env = DispatchEnv(seed)
            reward = 0.
            while not env.done:
                reward += env.step(baseline_action(env, 'cost_centroid'))
                self.assertGreaterEqual(env.batteries.min(), env.reserve - 1e-8)
            self.assertEqual(len(env.completions), env.n)
            self.assertAlmostEqual(env.flow, sum(env.completions))
            self.assertAlmostEqual(reward, -env.metrics()['objective'] / 100)
            completed = [t['order'] for wave in env.history for t in wave['assignments']]
            self.assertEqual(sorted(completed), list(range(env.n)))

    def test_unload_bay_never_overlaps_and_mother_must_arrive(self):
        env = DispatchEnv(4)
        while not env.done:
            env.step(baseline_action(env, 'cost_centroid'))
        for wave in env.history:
            completions = sorted(c for c in wave['completions'] if c > 0)
            self.assertTrue(all(b - a >= 2 - 1e-8 for a, b in zip(completions, completions[1:])))
            drive_time = np.abs(np.array(wave['meeting']) - wave['rover']).sum() / 4
            self.assertTrue(all(c >= drive_time + 2 - 1e-8 for c in completions))

    def test_mask_forbids_duplicate_order_and_terminal_step(self):
        env = DispatchEnv(9)
        for action in [-1, 18, True, 1.5]:
            with self.assertRaises(ValueError):
                env.step(action)
        env.step(4)
        env.step(0)
        self.assertFalse(env.observation()['mask'][0])
        with self.assertRaises(ValueError):
            env.step(0)
        while not env.done:
            env.step(baseline_action(env, 'cost_centroid'))
        with self.assertRaises(ValueError):
            env.step(4)

    def test_preflight_charging_delays_every_departure_and_carrier(self):
        env = DispatchEnv(1, count=9)
        env.batteries[:] = 0.
        env.step(8)
        while env.stage != 'mother':
            env.step(baseline_action(env, 'cost_centroid'))
        wave = env.history[0]
        self.assertGreater(wave['launch_wait'], 0)
        drive = np.abs(np.array(wave['meeting']) - wave['rover']).sum() / 4
        for completion in wave['completions']:
            self.assertGreaterEqual(completion, wave['launch_wait'] + drive + 2)
        self.assertGreaterEqual(env.batteries.min(), env.reserve - 1e-8)

    def test_policy_mask_and_order_permutation_equivariance(self):
        torch.set_num_threads(1)
        torch.manual_seed(3)
        policy = DispatchPolicy()
        env = DispatchEnv(3, count=12)
        env.step(4)
        first = env.observation()
        permutation = np.random.default_rng(4).permutation(env.n)
        env.case = Scenario(env.case.orders[permutation], env.case.batteries, env.case.speeds, env.case.energy_rates)
        second = env.observation()
        with torch.no_grad():
            a, va = policy(**tensors([first]))
            b, vb = policy(**tensors([second]))
        np.testing.assert_allclose(a.probs[0, :env.n].numpy()[permutation], b.probs[0, :env.n].numpy(), atol=1e-6)
        self.assertAlmostEqual(float(va), float(vb), places=5)
        self.assertTrue(torch.all(a.probs[0, env.n:MAX_ACTIONS] == 0))


if __name__ == '__main__':
    unittest.main()
