"""Event-driven, centralized cooperative dispatch research environment.

All parcels exist at t=0. Each wave selects a road rendezvous then one parcel
per UAV. The rover drives while aircraft fly; a single unload bay serializes
arrivals. Aircraft regroup before the next wave. This is an analytical dispatch
model, not a flight dynamics or collision simulator. Units: metres, seconds, Wh.
"""
from dataclasses import dataclass
import numpy as np

MAX_ORDERS = 18
MAX_ACTIONS = 18
ORDER_DIM = 8
CANDIDATE_DIM = 16
GLOBAL_DIM = 36
ENERGY_WEIGHT = 2.0  # seconds / Wh; objective = mean latency + weight * Wh/order
SITES = np.array([(x, y) for x in (-30., 0., 30.) for y in (-30., 0., 30.)])


@dataclass
class Scenario:
    orders: np.ndarray
    batteries: np.ndarray
    speeds: np.ndarray
    energy_rates: np.ndarray


def scenario(seed, count=None):
    rng = np.random.default_rng(seed)
    count = int(count or rng.choice([9, 12, 15, 18]))
    centers = rng.uniform(-65, 65, (int(rng.integers(2, 5)), 2))
    xy = centers[rng.integers(len(centers), size=count)] + rng.normal(0, 22, (count, 2))
    xy = np.clip(xy, -95, 95)
    heights = rng.choice([0., 8., 16., 24.], count)
    return Scenario(np.column_stack((xy, heights)), rng.uniform(16, 45, 3),
                    rng.uniform(7, 9, 3), rng.uniform(.045, .065, 3))


class DispatchEnv:
    capacity = 45.
    reserve = 4.5
    charge_rate = .35  # Wh/sec; automatic minimum preflight top-up
    unload_seconds = 2.

    def __init__(self, seed=0, count=None, energy_weight=ENERGY_WEIGHT):
        self.case = scenario(seed, count)
        self.energy_weight = float(energy_weight)
        self.n = len(self.case.orders)
        self.pending = np.ones(self.n, dtype=bool)
        self.batteries = self.case.batteries.copy()
        self.rover = np.zeros(2)
        self.meeting = self.rover.copy()
        self.elapsed = self.flow = self.energy = self.distance = 0.
        self.completions = []
        self.wave = []
        self.stage = 'mother'
        self.uav = 0
        self.done = False
        self.history = []

    def trip(self, order_id, uav, meeting=None):
        goal = self.meeting if meeting is None else meeting
        point = self.case.orders[order_id]
        outward = np.linalg.norm(point[:2] - self.rover)
        inward = np.linalg.norm(point[:2] - goal)
        vertical = 2 * abs(point[2] + .95 - 2.63)
        flight = (outward + inward) / self.case.speeds[uav] + vertical / 2. + 4.
        movement_energy = (outward + inward) * self.case.energy_rates[uav] + vertical * .14 + 4 * .02
        mother_time = np.abs(goal - self.rover).sum() / 4.
        # Conservative hover bound includes mother travel and two earlier unloads.
        required = movement_energy + .02 * (mother_time + 2 * self.unload_seconds)
        if required + self.reserve > self.capacity:
            raise ValueError('Unreachable mission under configured battery capacity')
        charge = max(0., required + self.reserve - self.batteries[uav]) / self.charge_rate
        arrival = max(charge + flight, mother_time)
        return dict(order=int(order_id), uav=uav, flight=flight, charge=charge,
                    arrival=arrival, movement_energy=movement_energy,
                    distance=outward + inward + vertical)

    def observation(self):
        orders = np.zeros((MAX_ORDERS, ORDER_DIM), dtype=np.float32)
        orders[:self.n, :3] = self.case.orders / [100, 100, 30]
        orders[:self.n, 3] = self.pending
        orders[:self.n, 4] = np.linalg.norm(self.case.orders[:, :2] - self.rover, axis=1) / 200
        orders[:self.n, 5] = np.linalg.norm(self.case.orders[:, :2] - self.meeting, axis=1) / 200
        orders[:self.n, 6] = self.elapsed / 400
        orders[:self.n, 7] = 1
        global_features = np.concatenate([
            self.rover / 100, self.meeting / 100, self.batteries / 45,
            self.case.speeds / 10, self.case.energy_rates / .1,
            [self.elapsed / 400, self.pending.sum() / MAX_ORDERS, self.n / MAX_ORDERS,
             self.stage == 'mother'], np.eye(3)[self.uav],
            np.array([[next((t[k] for t in self.wave if t['uav'] == u), 0.)
                       for k in ('arrival', 'movement_energy', 'charge')] for u in range(3)]).ravel() / np.tile([100, 30, 100], 3),
            [len(self.wave) / 3, self.flow / (self.n * 400), self.energy / (self.n * 30),
             np.abs(self.meeting - self.rover).sum() / 120, 1., self.energy_weight / 10, 0.]
        ]).astype(np.float32)
        assert len(global_features) == GLOBAL_DIM, len(global_features)
        candidates = np.zeros((MAX_ACTIONS, CANDIDATE_DIM), dtype=np.float32)
        mask = np.zeros(MAX_ACTIONS, dtype=bool)
        waiting = self.case.orders[self.pending]
        if self.stage == 'mother':
            for i, site in enumerate(SITES):
                dist = np.linalg.norm(waiting[:, :2] - site, axis=1) if len(waiting) else np.zeros(1)
                drive = np.abs(site - self.rover).sum() / 4
                candidates[i] = [1, 0, * (site / 100), 0, drive / 60,
                                 dist.mean() / 150, dist.min() / 150, dist.max() / 200,
                                 np.quantile(dist, .5) / 150, (dist < 40).mean(),
                                 np.linalg.norm(site - self.rover) / 100, 0, 0, 0, 1]
                mask[i] = True
        else:
            for i in np.flatnonzero(self.pending):
                t = self.trip(i, self.uav)
                point = self.case.orders[i]
                candidates[i] = [0, 1, *(point / [100, 100, 30]), t['arrival'] / 100,
                                 t['movement_energy'] / 30, t['charge'] / 100,
                                 t['flight'] / 100, t['distance'] / 300,
                                 np.linalg.norm(point[:2] - self.rover) / 150,
                                 np.linalg.norm(point[:2] - self.meeting) / 150,
                                 self.batteries[self.uav] / 45,
                                 max((x['arrival'] for x in self.wave), default=0) / 100,
                                 self.uav / 2, 1]
                mask[i] = True
        return dict(orders=orders, global_features=global_features, candidates=candidates, mask=mask)

    def step(self, action):
        if self.done or not self.observation()['mask'][action]:
            raise ValueError('Invalid action')
        if self.stage == 'mother':
            self.meeting = SITES[action].copy()
            self.stage = 'uav'
            return 0.
        self.wave.append(self.trip(action, self.uav))
        self.pending[action] = False
        self.uav += 1
        if self.uav < 3 and self.pending.any():
            return 0.
        reward = self.finish_wave()
        self.done = not self.pending.any()
        self.stage = 'mother'
        self.uav = 0
        self.wave = []
        return reward

    def finish_wave(self):
        bay_free = 0.
        used = np.zeros(3)
        completion = np.zeros(3)
        for t in sorted(self.wave, key=lambda t: (t['arrival'], t['uav'])):
            u = t['uav']
            landing = max(t['arrival'], bay_free)
            bay_free = landing + self.unload_seconds
            hover = max(0., landing - (t['charge'] + t['flight']))
            used[u] = t['movement_energy'] + hover * .02
            completion[u] = bay_free
            self.batteries[u] += t['charge'] * self.charge_rate - used[u]
            if self.batteries[u] < self.reserve - 1e-7:
                raise AssertionError('Battery reserve violated')
            self.completions.append(self.elapsed + bay_free)
            self.distance += t['distance']
        duration = bay_free
        increment = self.pending.sum() * duration + completion.sum()
        self.flow += increment
        self.energy += used.sum()
        for u in range(3):
            self.batteries[u] = min(self.capacity, self.batteries[u] + (duration - completion[u]) * self.charge_rate)
        self.history.append(dict(start=self.elapsed, duration=duration, rover=self.rover.tolist(),
                                 meeting=self.meeting.tolist(), assignments=[dict(t) for t in self.wave],
                                 energy=used.tolist(), completions=completion.tolist()))
        self.elapsed += duration
        self.rover = self.meeting.copy()
        return -(increment / self.n + self.energy_weight * used.sum() / self.n) / 100

    def metrics(self):
        return dict(mean_latency_s=self.flow / self.n, energy_wh=self.energy,
                    energy_per_order_wh=self.energy / self.n,
                    objective=self.flow / self.n + self.energy_weight * self.energy / self.n,
                    makespan_s=self.elapsed, completion_rate=len(self.completions) / self.n,
                    distance_m=self.distance)


def baseline_action(env, method):
    ids = np.flatnonzero(env.pending)
    if env.stage == 'mother':
        if method == 'nearest_fixed':
            return 4
        center = env.case.orders[ids, :2].mean(axis=0)
        return int(np.argmin(np.linalg.norm(SITES - center, axis=1)))
    if method == 'nearest_centroid' or method == 'nearest_fixed':
        return int(min(ids, key=lambda i: np.linalg.norm(env.case.orders[i, :2] - env.rover)))
    # Stronger myopic time + energy rule, also used for policy warm start.
    return int(min(ids, key=lambda i: env.trip(i, env.uav)['arrival'] +
                   env.energy_weight * env.trip(i, env.uav)['movement_energy']))
