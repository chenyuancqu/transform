"""Live campus adapter for the trained V2 discrete cooperative policy.

The policy chooses orders and rendezvous sites; Mission still executes precise
flight/pickup/unload states. Measured campus execution is NOT the training model.
"""
import copy
import math
from pathlib import Path
import sys
import time

import numpy as np
import onnxruntime as ort

from mission import Mission, HOME_PHASES, carrier_pad, dock, stand, distance, world, move

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from experiments.dispatch_v2.env import DispatchEnv, Scenario, SITES


class DispatchPolicy:
    def __init__(self):
        options = ort.SessionOptions()
        options.intra_op_num_threads = options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(Path(__file__).parent / 'models/dispatch_v2.onnx'),
            sess_options=options, providers=['CPUExecutionProvider'])
        self.count = 0
        self.latency = None

    def decide(self, view, allowed=None):
        obs = view.observation()
        if allowed is not None:
            obs['mask'] &= allowed
        if not obs['mask'].any():
            return None, None
        scores, value = self.session.run(None, {key: data[None, ...] for key, data in obs.items()})
        scores = scores[0]
        if not np.isfinite(scores).all():
            raise ValueError('V2 policy produced invalid scores')
        action = int(scores.argmax())
        if not obs['mask'][action]:
            raise ValueError('V2 policy selected a masked action')
        self.count += 1
        probabilities = np.exp(scores - scores[obs['mask']].max()) * obs['mask']
        probabilities /= probabilities.sum()
        rank = sorted(np.flatnonzero(obs['mask']), key=lambda i: -probabilities[i])[:3]
        trace = dict(stage=view.stage, uavId=view.uav + 1 if view.stage == 'uav' else None,
            action=action, value=float(value[0]), validActions=int(obs['mask'].sum()),
            candidates=[dict(action=int(i), probability=float(probabilities[i]),
                label=f"接应点 {i + 1}" if view.stage == 'mother' else f"订单 {i + 1}") for i in rank])
        return action, trace

    def plan(self, mission, fixed_site=None, only_uav_ids=None):
        started = time.perf_counter()
        # Slots represent currently unreserved orders, not historical order
        # IDs.  This lets a returned UAV refill its slot while other UAVs in
        # the same wave are still flying or unloading.
        window = sorted((o for o in mission.orders if not o['completed'] and o['reservedBy'] is None),
                        key=lambda o: (o['createdAt'], o['id']))[:18]
        if not window:
            return None
        view = DispatchEnv(0, count=9, energy_weight=6)
        view.n = len(window)
        view.case = Scenario(np.array([world(o) for o in window]),
            np.array([u['battery'] * 45 for u in mission.uavs]),
            np.array([7.5, 8., 8.5]), np.array([.055, .05, .06]))
        view.batteries = view.case.batteries.copy()
        view.rover = np.array(world(mission.rover)[:2])
        view.meeting = view.rover.copy()
        areas = {u['preferredArea'] for u in mission.uavs if u['enabled'] and u['preferredArea']}
        view.pending = np.array([not areas or o['area'] in areas for o in window], dtype=bool)
        if not view.pending.any() or not any(u['enabled'] for u in mission.uavs):
            return None
        view.elapsed = mission.elapsed
        view.flow = sum((o['deliveredAt'] if o['deliveredAt'] is not None else mission.elapsed) - o['createdAt'] for o in mission.orders)
        view.energy = mission.stats['uavEnergyWh']
        if fixed_site is None:
            site, trace = self.decide(view)
        else:
            site = int(fixed_site)
            trace = dict(stage='mother', uavId=None, action=site, value=None,
                         validActions=1, candidates=[dict(action=site, probability=1., label=f'接应点 {site + 1}')])
        view.meeting = SITES[site].copy()
        view.stage = 'uav'
        traces, assignments = [trace], []
        for uav in mission.uavs:
            # A UAV that is still unloading or folding back belongs to the
            # previous wave.  It must not receive a new reservation while its
            # physical state is still being completed.  HOME_PHASES includes
            # charging, so a low-battery aircraft can still be reserved for
            # the next wave and join after it has replenished on the carrier.
            if (not uav['enabled'] or uav['phase'] not in HOME_PHASES
                    or uav['cargoOrderId'] is not None or uav['targetOrderId'] is not None
                    or not view.pending.any()
                    or (only_uav_ids is not None and uav['id'] not in only_uav_ids)):
                continue
            view.uav = uav['id'] - 1
            allowed = np.zeros(18, dtype=bool)
            for index in np.flatnonzero(view.pending):
                trip = view.trip(index, view.uav)
                # Campus takeoff/precision approach adds travel and hover beyond
                # the analytical training trip. Keep a conservative extra margin.
                wh = trip['movement_energy'] + 2. + .02 * (np.abs(view.meeting - view.rover).sum() / 4 + 8)
                percent = wh / 45 * 100
                allowed[index] = (wh + 4.5 <= 45 and
                    (uav['energyLimit'] is None or uav['missionEnergy'] + percent <= uav['energyLimit']))
            action, decision = self.decide(view, allowed)
            if action is None:
                continue
            order_id = window[action]['id']
            decision['orderId'] = order_id
            for candidate in decision['candidates']:
                candidate['orderId'] = window[candidate['action']]['id']
                candidate['label'] = f"订单 {candidate['orderId']}"
            trip = view.trip(action, view.uav)
            required = trip['movement_energy'] + 2. + .02 * (np.abs(view.meeting - view.rover).sum() / 4 + 8) + 4.5
            assignments.append(dict(uavId=uav['id'], orderId=order_id, requiredBattery=required / 45))
            traces.append(decision)
            view.wave.append(trip)
            view.pending[action] = False
        self.latency = (time.perf_counter() - started) * 1000
        if not assignments:
            return None
        return dict(site=site + 1, rendezvous=view.meeting.tolist(), assignments=assignments, traces=traces,
                    windowOrderIds=[o['id'] for o in window])


class V2Mission(Mission):
    def __init__(self, policy=None, rng=None, order_count=None, max_orders=30):
        self.policy = policy or DispatchPolicy()
        super().__init__(order_count=order_count, rng=rng, max_orders=max_orders)

    def reset(self):
        super().reset()
        self.speed = 1.5
        self.wave_number = 0
        self.wave_plan = None
        self.queued_command = None
        self.wave_stage = 'ready'
        self.last_plan = None
        self.stats.update(uavEnergyWh=0., averageUavEnergyPerOrderWh=None, dispatchObjective=None)

    def _reserve_assignments(self, plan):
        """Apply a policy plan without changing the aircraft's physical phase.

        The caller only passes HOME_PHASES aircraft.  Keeping this operation in
        one place is important for rolling refill: an aircraft that is still
        unloading/parking must never be overwritten by a new reservation.
        """
        applied = []
        for assignment in plan.get('assignments', []):
            uav = self.uavs[assignment['uavId'] - 1]
            order = next((o for o in self.orders if o['id'] == assignment['orderId']), None)
            if (order is None or order['completed'] or order['reservedBy'] is not None
                    or not uav['enabled'] or uav['phase'] not in HOME_PHASES
                    or uav['cargoOrderId'] is not None or uav['targetOrderId'] is not None):
                continue
            order.update(reservedBy=uav['id'], status='enroute')
            uav.update(targetOrderId=order['id'], missionOrderId=order['id'],
                       phase='charging' if uav['battery'] < assignment['requiredBattery'] else 'docked')
            applied.append(assignment)
        return applied

    def _refill_wave(self):
        """Assign free aircraft into the current rendezvous wave.

        The mother keeps the existing rendezvous, so a returned aircraft can
        launch a new pickup while another aircraft is using the single bay.
        This is deliberately limited to HOME_PHASES aircraft and unreserved
        orders; the physical unloading queue remains authoritative.
        """
        if not self.wave_plan or self.wave_stage != 'executing':
            return False
        free_ids = {u['id'] for u in self.uavs if u['enabled'] and u['phase'] in HOME_PHASES
                    and u['cargoOrderId'] is None and u['targetOrderId'] is None}
        if not free_ids:
            return False
        refill = self.policy.plan(self, fixed_site=self.wave_plan['site'] - 1,
                                  only_uav_ids=free_ids)
        if not refill:
            return False
        applied = self._reserve_assignments(refill)
        if not applied:
            return False
        self.wave_plan['assignments'].extend(copy.deepcopy(applied))
        # Keep the model trace window bounded to the original 18 slots.  A
        # refill is a new policy call over a later window and its assignment
        # is already carried by the stable real order ID; mixing the two
        # windows would make an old `action` index ambiguous in the UI.
        pairs = ' / '.join(f"UAV {a['uavId']}→订单 {a['orderId']}" for a in applied)
        self.event(f'V2 第 {self.wave_number} 波滚动补派 · {pairs} · 保持接应点 {self.wave_plan["site"]}')
        return True

    def assign(self):
        if not self.running:
            return
        if self.emergency_return:
            return
        if self.wave_plan:
            if self.wave_stage in ['preflight', 'executing']:
                launched = []
                for a in self.wave_plan['assignments']:
                    u = self.uavs[a['uavId'] - 1]
                    order = next((o for o in self.orders if o['id'] == a['orderId']), None)
                    if (order and not order['completed'] and u['targetOrderId'] == a['orderId']
                            and u['phase'] in HOME_PHASES and u['battery'] >= a['requiredBattery']):
                        u.update(phase='takingOff', stableElapsed=0., pickupProgress=0.)
                        launched.append(u['id'])
                if launched and self.wave_stage == 'preflight':
                    self.wave_stage = 'executing'
                    self.event(f'V2 第 {self.wave_number} 波分批起飞 · UAV {", ".join(map(str, launched))} 前往接应点 {self.wave_plan["site"]}')
                if self.wave_stage == 'executing':
                    self._refill_wave()
            return
        # A wave can be handed off as soon as at least one aircraft is back on
        # the carrier.  Other aircraft may still be folding/parking from the
        # previous wave; DispatchPolicy.plan() filters them out until they
        # become physically available.  Waiting for all three here was the
        # source of the long "波次回收" idle window.
        available = [u for u in self.uavs if u['enabled'] and u['phase'] in HOME_PHASES
                     and u['cargoOrderId'] is None and u['targetOrderId'] is None]
        if not available or self.docking['hatchProgress'] > 0:
            return
        if self.queued_command:
            command = self.queued_command
            self.queued_command = None
            super().command(command)
        plan = self.policy.plan(self)
        if not plan:
            eligible = any(not o['completed'] and any(u['enabled'] and
                (not u['preferredArea'] or u['preferredArea'] == o['area']) for u in self.uavs) for o in self.orders)
            if self.order_stream_enabled and not eligible:
                self.wave_stage = 'waitingOrders'
                if not self.events or self.events[-1]['text'] != '订单流运行中 · 等待新订单到达':
                    self.event('订单流运行中 · 等待新订单到达')
                return
            self.running = False
            self.wave_stage = 'scopeComplete'
            self.event('本次调度范围已完成或预算不足 · 可继续派发其它区域任务')
            return
        self.wave_number += 1
        self.wave_plan = self.last_plan = copy.deepcopy(plan)
        self.wave_stage = 'preflight'
        self._reserve_assignments(self.wave_plan)
        if not self.wave_plan['assignments']:
            self.wave_plan = None
            self.wave_stage = 'regrouping'
            return
        pairs = ' / '.join(f"UAV {a['uavId']}→订单 {a['orderId']}" for a in self.wave_plan['assignments'])
        self.event(f'PPO 第 {self.wave_number} 波 · 接应点 {self.wave_plan["site"]} · {pairs}')

    def meeting_rover(self):
        plan = self.wave_plan or self.last_plan
        if not plan:
            return self.rover
        x, y = plan['rendezvous']
        return dict(x=(x + 100) / 200, y=(y + 100) / 200, z=0, heading=self.rover['heading'])

    def at_meeting(self):
        return distance(self.rover, self.meeting_rover()) < .02

    def should_park_rover(self):
        return (self.emergency_return or not self.wave_plan or self.wave_stage == 'preflight'
            or any(u['phase'] in ['takingOff', 'unloading', 'clearingBay', 'parking'] for u in self.uavs))

    def move_rover(self, dt, actions):
        goal = self.meeting_rover()
        # Manhattan path on the central square's road network, not a diagonal cut.
        for axis in ['x', 'y']:
            difference = (goal[axis] - self.rover[axis]) * 200
            if abs(difference) > 1e-6:
                self.rover[axis] += math.copysign(min(abs(difference), 4 * dt), difference) / 200
                break

    def charge(self, uav, dt):
        uav['battery'] = min(1., uav['battery'] + dt * .35 / 45)

    def move_cruise(self, uav, goal, dt, actions):
        move(uav, goal, dt, [7.5, 8., 8.5][uav['id'] - 1])

    def return_goal(self, uav, owns_bay):
        if not self.at_meeting():
            return stand(self.meeting_rover(), uav, waiting=True)
        return super().return_goal(uav, owns_bay)

    def can_unload(self, uav, goal):
        return self.at_meeting() and super().can_unload(uav, goal)

    def consume_energy(self, uav, before, dt, order_id):
        a, b = world(before), world(uav)
        horizontal = math.hypot(a[0] - b[0], a[1] - b[1])
        vertical = abs(a[2] - b[2])
        wh = horizontal * [.055, .05, .06][uav['id'] - 1] + vertical * .14
        wh += .02 * dt
        used = min(uav['battery'], wh / 45)
        uav['battery'] -= used
        uav['missionEnergy'] += used * 100
        self.stats['energyConsumed'] += used * 100
        self.stats['uavEnergyWh'] += used * 45
        order = next((o for o in self.orders if o['id'] == order_id), None)
        if order:
            order['energyConsumedPercent'] += used * 100
        if uav['battery'] <= .03:
            self.running = False
            self.event(f'UAV {uav["id"]} 电量保护 · 任务已暂停，请重置检查')

    def finish_step(self):
        delivered = [o for o in self.orders if o['deliveredAt'] is not None]
        self.stats['averageUavEnergyPerOrderWh'] = (self.stats['uavEnergyWh'] / len(delivered)) if delivered else None
        self.stats['dispatchObjective'] = (sum((o['deliveredAt'] if o['deliveredAt'] is not None else self.elapsed) - o['createdAt']
            for o in self.orders) + 6 * self.stats['uavEnergyWh']) / len(self.orders)
        home = all(u['phase'] in HOME_PHASES for u in self.uavs) and self.docking['hatchProgress'] == 0
        if self.emergency_return:
            if home:
                for u in self.uavs:
                    u['enabled'] = (self.emergency_enabled or {}).get(u['id'], True)
                self.emergency_enabled = None
                self.emergency_return = False
                self.wave_plan = None
                self.queued_command = None
                self.running = False
                self.wave_stage = 'ready'
                self.event('紧急返航完成 · 全部无人机已回到母车')
            return
        wave_orders = [next((o for o in self.orders if o['id'] == a['orderId']), None)
                       for a in (self.wave_plan or {}).get('assignments', [])]
        wave_complete = bool(wave_orders) and all(o is not None and o['status'] == 'delivered' for o in wave_orders)
        previous_wave_active = any(u['phase'] in ['returning', 'waitingDock', 'unloading']
                                   or u['cargoOrderId'] is not None for u in self.uavs)
        if (self.wave_stage == 'executing' and wave_complete
                and self.docking['hatchProgress'] == 0 and not previous_wave_active):
            self.wave_plan = None
            self.wave_stage = 'regrouping'
            # The next plan is allowed to start on the first available UAV.
            # Remaining aircraft finish clearing/parking in parallel and are
            # picked up by the next assign() call once they reach HOME_PHASES.
            self.event('本波订单已交付 · 可用无人机先行进入下一波，其他无人机并行归位')
            self.assign()
        if home and len(delivered) == len(self.orders) and not self.order_stream_enabled:
            self.running = False
            self.wave_stage = 'complete'
            for u in self.uavs:
                u['phase'] = 'docked'
            self.event('本轮订单已全部完成 · V2 PPO 调度结束')
        elif home:
            self.assign()

    def command(self, data):
        if data.get('action_type') == 'query_status':
            return self.query_status(data)
        # Validate with the established command validator, without mutating live
        # in-flight assignments. Dispatch changes take effect at a wave boundary.
        shadow = Mission.__new__(Mission)
        shadow.__dict__ = copy.deepcopy({k: v for k, v in self.__dict__.items() if k != 'policy'})
        Mission.command(shadow, data)
        if data['action_type'] == 'emergency_stop':
            message = Mission.command(self, data)
            self.wave_plan = None
            self.queued_command = None
            self.wave_stage = 'emergencyReturn'
            return message
        if self.wave_plan:
            self.queued_command = copy.deepcopy(data)
            self.running = True
            self.last_command = copy.deepcopy(data)
            self.event('新调度已排队 · 当前波次交付完成后生效')
            return '调度已确认 · 当前波次交付完成后由 PPO 重新选单'
        return super().command(data)

    def snapshot(self, health):
        snap = super().snapshot(health)
        plan = self.wave_plan or self.last_plan
        snap['dispatch'] = dict(version=2, policy='PPO', mode='campus_wave_adapter',
            wave=self.wave_number, stage=self.wave_stage, fixedOrders=not self.dynamic_order_stream,
            orderStream=dict(enabled=self.order_stream_enabled, intervalSeconds=12, retrySeconds=3,
                             maxOrders=self.max_orders, nextOrderAt=self.next_order_at),
            energyWeight=6, batteryCapacityWh=45, pendingCommand=self.queued_command is not None,
            rendezvous=plan['rendezvous'] if plan else None, site=plan['site'] if plan else None,
            assignments=copy.deepcopy(plan['assignments']) if plan else [],
            decisions=copy.deepcopy(plan['traces']) if plan else [],
            windowOrderIds=plan['windowOrderIds'].copy() if plan else [],
            observationShape='订单 18×8 · 全局 36 · 候选 18×16',
            adaptation='动态到单园区适配 · 训练为静态9–18单 · 效果需单独评估')
        return snap
