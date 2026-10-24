"""Authoritative mission world. Normalized inputs match upstream trained actors.

Only the wire/rendering boundary uses metres [horizontal x, horizontal y, height].
No renderer feedback or browser timer participates in arrival or completion.
"""
import copy
import json
import math
import random
import time
import uuid
from pathlib import Path


PICKUP_LOCATIONS = json.loads((Path(__file__).resolve().parents[1] / 'src' / 'core' / 'campusPickupLocations.json').read_text(encoding='utf-8'))
CARRIER_PAD_LAYOUT = json.loads((Path(__file__).resolve().parents[1] / 'src' / 'core' / 'campusCarrierPads.json').read_text(encoding='utf-8'))
MIN_RANDOM_ORDERS = 4
MAX_ORDERS = len(PICKUP_LOCATIONS)
MAX_ORDERS_PER_MISSION = 30
ORDER_SPAWN_INTERVAL_SECONDS = 12.
ORDER_SPAWN_RETRY_SECONDS = 3.
MIN_DISPATCH_BATTERY = .25
BATTERY_RESERVE_PERCENT = 5.
HOME_PHASES = ('charging', 'docked')
BATTERY_PROFILES = {'balanced': (1., 1., 1.), 'imbalanced': (.42, .68, .91)}
TAKEOFF_ALTITUDE = 5.5 / 50


def world(p):
    return [p['x'] * 200 - 100, p['y'] * 200 - 100, p.get('z', 0) * 50]


def normalise_world_position(position):
    if not isinstance(position, (list, tuple)) or len(position) != 3:
        raise ValueError('target_position 必须是 [x, y, z] 三维米制坐标')
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
           for value in position):
        raise ValueError('target_position 必须只包含有限数字')
    x, y, z = [float(value) for value in position]
    if not -100 <= x <= 100 or not -100 <= y <= 100 or not 0 <= z <= 50:
        raise ValueError('target_position 超出园区范围（x/y -100–100m，z 0–50m）')
    return dict(x=(x + 100) / 200, y=(y + 100) / 200, z=z / 50)


def distance(a, b):
    return math.dist(world(a), world(b))


def pickup(order):
    return dict(x=order['x'], y=order['y'], z=order['z'] + .95 / 50)


def dock(rover, uav):
    heading = rover.get('heading', 0)
    return dict(x=rover['x'] - .15 * math.sin(heading) / 200,
                y=rover['y'] - .15 * math.cos(heading) / 200, z=2.63 / 50)


def carrier_pad(rover, uav):
    # Three folded aircraft use separate cradles on the mother-car roof.
    x, z = CARRIER_PAD_LAYOUT['positions'][uav['id'] - 1]
    heading = rover.get('heading', 0)
    return dict(x=rover['x'] + (x * math.cos(heading) + z * math.sin(heading)) / 200,
                y=rover['y'] + (z * math.cos(heading) - x * math.sin(heading)) / 200,
                z=CARRIER_PAD_LAYOUT['aircraftCenterHeight'] / 50)


def stand(rover, uav, waiting=False):
    dx, dy = [(-5.5, 3), (5.5, 3), (0, -6.5)][uav['id'] - 1]
    heading = rover.get('heading', 0)
    return dict(x=rover['x'] + (dx * math.cos(heading) + dy * math.sin(heading)) / 200,
                y=rover['y'] + (dy * math.cos(heading) - dx * math.sin(heading)) / 200,
                z=(4.6 if waiting else .37) / 50)


def move(p, goal, dt, speed):
    dx, dy = (goal['x'] - p['x']) * 200, (goal['y'] - p['y']) * 200
    length = math.hypot(dx, dy)
    ratio = min(1, speed * dt / length) if length else 0
    p['x'] += dx * ratio / 200
    p['y'] += dy * ratio / 200
    dz = (goal['z'] - p['z']) * 50
    p['z'] += math.copysign(min(abs(dz), 1.2 * dt), dz) / 50


def aligned(uav, order, velocity):
    a, b = world(uav), world(pickup(order))
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= .35 and abs(a[2] - b[2]) <= .2 and velocity <= .15


def aligned_position(uav, target, velocity):
    a, b = world(uav), world(target)
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= .35 and abs(a[2] - b[2]) <= .2 and velocity <= .15


class Mission:
    def __init__(self, order_count=None, rng=None, max_orders=MAX_ORDERS_PER_MISSION):
        if order_count is not None and (isinstance(order_count, bool) or not isinstance(order_count, int)
                                        or not MIN_RANDOM_ORDERS <= order_count <= MAX_ORDERS):
            raise ValueError(f'order_count must be between {MIN_RANDOM_ORDERS} and {MAX_ORDERS}')
        if isinstance(max_orders, bool) or not isinstance(max_orders, int) or not MIN_RANDOM_ORDERS <= max_orders <= MAX_ORDERS_PER_MISSION:
            raise ValueError(f'max_orders must be between {MIN_RANDOM_ORDERS} and {MAX_ORDERS_PER_MISSION}')
        self.order_count = order_count
        self.dynamic_order_stream = order_count is None
        self.max_orders = max_orders if self.dynamic_order_stream else order_count
        self.rng = rng or random.Random()
        self.battery_mode = 'balanced'
        self.reset()

    @staticmethod
    def location_area(location):
        _, _, horizontal_y = location['position']
        normalized_y = (horizontal_y + 100) / 200
        return 'A' if normalized_y < .4 else 'B' if normalized_y > .6 else 'C'

    def generate_orders(self):
        by_area = {area: [] for area in 'ABC'}
        for location in PICKUP_LOCATIONS:
            by_area[self.location_area(location)].append(location)
        initial_max = min(MAX_ORDERS, self.max_orders)
        count = self.order_count if self.order_count is not None else self.rng.randint(MIN_RANDOM_ORDERS, initial_max)
        # Keep every area serviceable for area-specific dispatches, then sample
        # additional unique, surveyed pickup anchors for this mission.
        selected = [self.rng.choice(by_area['A'])]
        selected.extend(self.rng.sample(by_area['B'], 2))
        selected.append(self.rng.choice(by_area['C']))
        remaining = [location for location in PICKUP_LOCATIONS if location not in selected]
        selected.extend(self.rng.sample(remaining, count - len(selected)))
        self.rng.shuffle(selected)
        return [self.make_order(location, order_id) for order_id, location in enumerate(selected, 1)]

    def make_order(self, location, order_id):
        x, height, z = location['position']
        bx, by = (x + 100) / 200, (z + 100) / 200
        return dict(id=order_id, locationId=location['id'], x=bx, y=by, z=height / 50,
                    pickupType=location['pickupType'], buildingId=location.get('buildingId'),
                    floor=location.get('floor'), area=self.location_area(location),
                    priority='normal', completed=False, status='waiting', reservedBy=None, deliveredAt=None,
                    createdAt=self.elapsed, energyConsumedPercent=0.)

    def spawn_order(self):
        if not self.dynamic_order_stream or len(self.orders) >= self.max_orders:
            return False
        occupied = {order['locationId'] for order in self.orders if not order['completed']}
        available = [location for location in PICKUP_LOCATIONS if location['id'] not in occupied
                     and (self.order_stream_area is None or self.location_area(location) == self.order_stream_area)]
        if not available:
            return False
        location = self.rng.choice(available)
        order = self.make_order(location, len(self.orders) + 1)
        self.orders.append(order)
        self.stats['totalOrders'] = len(self.orders)
        place = f"{order['buildingId']} · {order['floor']}F 阳台" if order['pickupType'] == 'balcony' else '中庭地面'
        self.event(f"新订单 {order['id']} 到达 · {place}")
        return True

    def configure_order_stream(self, area=None):
        has_enabled_agents = any(u['enabled'] for u in self.uavs)
        enabled = self.dynamic_order_stream and has_enabled_agents and len(self.orders) < self.max_orders
        self.order_stream_area = area if enabled else None
        if enabled and self.next_order_at is None:
            self.next_order_at = self.elapsed + ORDER_SPAWN_INTERVAL_SECONDS
        elif not enabled:
            self.next_order_at = None
        self.order_stream_enabled = enabled
        self.stats['orderStreamActive'] = enabled

    def update_order_stream(self):
        if not self.order_stream_enabled or self.next_order_at is None or self.elapsed < self.next_order_at:
            return
        spawned = self.spawn_order()
        if len(self.orders) >= self.max_orders:
            self.order_stream_enabled = False
            self.stats['orderStreamActive'] = False
            self.next_order_at = None
        else:
            self.next_order_at = self.elapsed + (ORDER_SPAWN_INTERVAL_SECONDS if spawned else ORDER_SPAWN_RETRY_SECONDS)

    def reset(self):
        self.epoch = uuid.uuid4().hex
        self.seq = 0
        self.running = False
        self.speed = .7
        self.elapsed = 0
        self.next_order_at = None
        self.order_stream_enabled = False
        self.order_stream_area = None
        self.rover = dict(x=.5, y=.5, z=0, heading=0)
        self.docking = dict(owner=None, queue=[], hatchProgress=0., stage='closed')
        self.uavs = []
        for index, battery in enumerate(BATTERY_PROFILES[self.battery_mode], 1):
            uav = dict(id=index, battery=battery, phase='charging' if battery < .995 else 'docked',
                       targetOrderId=None, cargoOrderId=None, stableElapsed=0., pickupProgress=0.,
                       unloadProgress=0., missionOrderId=None, enabled=True, preferredArea=None,
                       preferredOrderIds=None, commandTarget=None, energyLimit=None,
                       missionEnergy=0., retractProgress=0.)
            uav.update(carrier_pad(self.rover, uav))
            self.uavs.append(uav)
        self.orders = self.generate_orders()
        self.stats = dict(stepCount=0, completedOrders=0, deliveredOrders=0, uavDistanceMeters=0.,
                          roverDistanceMeters=0., energyConsumed=0., totalOrders=len(self.orders),
                          completionRate=0., averageOrderCompletionSeconds=None,
                          averageUavEnergyPerOrderPercent=None, averageDelaySeconds=None,
                          orderStreamActive=False)
        self.events = []
        self.last_command = None
        self.energy_mode = False
        self.emergency_return = False
        self.emergency_enabled = None

    def event(self, text):
        self.events.append(dict(time=round(self.elapsed, 1), text=text))
        self.events = self.events[-12:]

    def assign(self):
        for u in self.uavs:
            if self.emergency_return or not u['enabled'] or u['phase'] not in HOME_PHASES or u['cargoOrderId'] is not None or u['targetOrderId'] is not None:
                continue
            choices = [o for o in self.orders if not o['completed'] and o['reservedBy'] is None]
            if u['preferredArea']:
                choices = [o for o in choices if o['area'] == u['preferredArea']]
            if u.get('preferredOrderIds'):
                choices = [o for o in choices if o['id'] in u['preferredOrderIds']]
            if u['energyLimit'] is not None and u['missionEnergy'] >= u['energyLimit']:
                continue
            if not choices:
                continue
            if u['battery'] < MIN_DISPATCH_BATTERY:
                continue
            order = min(choices, key=lambda o: (0 if o.get('priority') == 'urgent' else 1,
                                                distance(u, pickup(o))))
            estimated = (distance(u, pickup(order)) + distance(pickup(order), dock(self.rover, u))) / 3.5 * (.003 / .52 * 100) + 3
            if u['battery'] * 100 < estimated + BATTERY_RESERVE_PERCENT:
                continue
            if u['energyLimit'] is not None and u['missionEnergy'] + estimated > u['energyLimit']:
                continue
            order.update(reservedBy=u['id'], status='enroute')
            u.update(targetOrderId=order['id'], missionOrderId=order['id'],
                     phase='takingOff', stableElapsed=0., pickupProgress=0.)
            self.event(f"UAV {u['id']} 分配订单 {order['id']} · {order['area']}区")

    def observations(self):
        waiting = [o for o in self.orders if not o['completed']]
        center = {k: sum(o[k] for o in waiting) / len(waiting) if waiting else .5 for k in ['x', 'y']}
        r = self.rover
        result = {'mother': [r['x'], r['y'], center['x'] - r['x'], center['y'] - r['y'],
                             len(waiting) / len(self.orders), sum(u['battery'] for u in self.uavs) / 3]}
        for u in self.uavs:
            order = next((o for o in self.orders if o['id'] == u['targetOrderId']), None)
            target = pickup(order) if order else (u.get('commandTarget') or dock(r, u))
            result[f"uav_{u['id']}"] = [u['x'], u['y'], u['z'], u['battery'], r['x'] - u['x'],
                                        r['y'] - u['y'], -u['z'], target['x'] - u['x'],
                                        target['y'] - u['y'], target['z'] - u['z']]
        return result

    def move_rover(self, dt, actions):
        for k, value in zip(['x', 'y'], actions.get('mother', [0, 0])):
            self.rover[k] = max(.35, min(.65, self.rover[k] + value * .0075 * dt / .52))

    def should_park_rover(self):
        return self.docking['hatchProgress'] > 0 or any(u['phase'] == 'parking' or
            (u['phase'] in ['returning', 'waitingDock'] and distance(u, dock(self.rover, u)) <= 8) for u in self.uavs)

    def charge(self, uav, dt):
        uav['battery'] = min(1., uav['battery'] + dt * .05)

    def move_cruise(self, uav, goal, dt, actions):
        action = actions.get(f"uav_{uav['id']}", [0, 0, 0])
        candidate = dict(x=max(0, min(1, uav['x'] + action[0] * .015 * dt / .52)),
                         y=max(0, min(1, uav['y'] + action[1] * .015 * dt / .52)),
                         z=max(.05, min(.12, uav['z'] + action[2] * .015 * dt / .52)))
        if distance(uav, goal) - distance(candidate, goal) >= .05 * dt:
            uav.update(candidate)
        else:
            move(uav, {**goal, 'z': max(.05, goal['z'])}, dt, 3.5 if self.energy_mode else 5)

    def return_goal(self, uav, owns_bay):
        return dock(self.rover, uav) if owns_bay else stand(self.rover, uav, waiting=True)

    def can_unload(self, uav, goal):
        return distance(uav, goal) <= .08 and self.docking['hatchProgress'] >= 1

    def consume_energy(self, uav, before, dt, order_id):
        cost = .003 * dt / .52 * (0.8 if self.energy_mode else 1)
        used = min(uav['battery'], cost)
        uav['battery'] -= used
        uav['missionEnergy'] += used * 100
        self.stats['energyConsumed'] += used * 100
        order = next((item for item in self.orders if item['id'] == order_id), None)
        if order:
            order['energyConsumedPercent'] += used * 100

    def advance(self, dt, actions):
        if not self.running:
            return
        self.elapsed += dt
        self.update_order_stream()
        self.assign()
        r = self.rover
        old_rover = r.copy()
        active = [u for u in self.uavs if (u['cargoOrderId'] is not None and u['phase'] in ['returning', 'waitingDock', 'unloading'])
                  or u['phase']=='clearingBay']
        ids = {u['id'] for u in active}
        self.docking['queue'] = [i for i in self.docking['queue'] if i in ids]
        for u in sorted(active, key=lambda u: distance(u, dock(r, u))):
            if u['id'] not in self.docking['queue']:
                self.docking['queue'].append(u['id'])
        self.docking['owner'] = self.docking['queue'][0] if self.docking['queue'] else None
        owner = next((u for u in active if u['id'] == self.docking['owner']), None)
        open_bay = owner is not None and (owner['phase'] in ['unloading','clearingBay'] or distance(owner, dock(r, owner)) <= 8)
        self.docking['hatchProgress'] = min(1., self.docking['hatchProgress'] + dt) if open_bay else max(0., self.docking['hatchProgress'] - dt)
        self.docking['stage'] = 'open' if self.docking['hatchProgress'] == 1 else 'closed' if self.docking['hatchProgress'] == 0 else 'opening' if open_bay else 'closing'
        for u in self.uavs:
            if u['phase'] == 'idle':
                on_carrier = distance(u, carrier_pad(r, u)) <= .2
                u['phase'] = ('charging' if u['battery'] < .995 else 'docked') if on_carrier else 'parking'
        if not self.should_park_rover() and not self.emergency_return:
            self.move_rover(dt, actions)
        if distance(r, old_rover) > .0001:
            r['heading'] = math.atan2(r['x'] - old_rover['x'], r['y'] - old_rover['y'])
        self.stats['roverDistanceMeters'] += distance(r, old_rover)
        for u in self.uavs:
            before = u.copy()
            mission_order_id = u.get('missionOrderId')
            if u['phase'] in HOME_PHASES:
                if u['phase'] == 'docked' and u['battery'] < .995:
                    u['phase'] = 'charging'
                u.update(carrier_pad(r, u))
                if u['phase'] == 'charging':
                    self.charge(u, dt)
                    if u['battery'] >= .995:
                        u['phase'] = 'docked'
            order = next((o for o in self.orders if o['id'] == u['targetOrderId'] and not o['completed']), None)
            command_target = u.get('commandTarget')
            if command_target:
                if u['phase'] != 'holding':
                    target_distance = distance(u, command_target)
                    move(u, command_target, dt, 4.5 if self.energy_mode else 6)
                    velocity = distance(u, before) / dt
                    if aligned_position(u, command_target, velocity) or target_distance <= .1:
                        u.update(command_target, phase='holding')
                        self.event(f"UAV {u['id']} 已到达 AI 指定坐标 · 稳定悬停")
                order = None
            if order and u['phase']=='takingOff':
                move(u,dict(x=u['x'],y=u['y'],z=TAKEOFF_ALTITUDE),dt,0)
                if abs(u['z']-TAKEOFF_ALTITUDE)*50<=.005:u.update(z=TAKEOFF_ALTITUDE,phase='cruising')
            if order and u['phase'] in ['cruising', 'approaching']:
                goal = pickup(order)
                dist = distance(u, goal)
                if dist <= 18 or u['phase'] == 'approaching':
                    u['phase'] = 'approaching'
                    order['status'] = 'approaching'
                    move(u, goal, dt, min(3, max(.25, dist * .9)))
                else:
                    self.move_cruise(u, goal, dt, actions)
            velocity = distance(u, before) / dt
            if order:
                if aligned(u, order, velocity):
                    if u['phase'] != 'picking':
                        u['phase'] = order['status'] = 'aligning'
                        u['stableElapsed'] += dt
                        if u['stableElapsed'] >= .8:
                            u['phase'] = order['status'] = 'picking'
                            self.event(f"UAV {u['id']} 悬停确认 · 取货订单 {order['id']}")
                    else:
                        u['pickupProgress'] = min(1, u['pickupProgress'] + dt / 3)
                        if u['pickupProgress'] >= 1:
                            order.update(completed=True, status='collected')
                            self.stats['completedOrders'] += 1
                            u.update(cargoOrderId=order['id'], targetOrderId=None, phase='returning', unloadProgress=0.)
                            self.event(f"订单 {order['id']} 已取货 · UAV {u['id']} 返航")
                elif u['phase'] in ['aligning', 'picking']:
                    u.update(phase='approaching', stableElapsed=0., pickupProgress=0.)
                    order['status'] = 'approaching'
            if u['phase'] in ['returning', 'waitingDock']:
                owns_bay = u['id'] == self.docking['owner']
                u['phase'] = 'returning' if owns_bay else 'waitingDock'
                goal = self.return_goal(u, owns_bay)
                move(u, goal, dt, 3.5 if self.energy_mode else 5)
                if owns_bay and self.can_unload(u, goal):
                    u.update(goal)
                    u.update(phase='unloading', unloadProgress=0.)
                    self.event(f"UAV {u['id']} 到达母车 · 订单货物入舱")
            elif u['phase'] == 'unloading':
                u.update(dock(r, u))
                u['unloadProgress'] = min(1, u['unloadProgress'] + dt / 1.5)
                if u['unloadProgress'] >= 1:
                    delivered = next(o for o in self.orders if o['id'] == u['cargoOrderId'])
                    delivered.update(status='delivered', deliveredAt=self.elapsed)
                    self.stats['deliveredOrders'] += 1
                    u.update(cargoOrderId=None, missionOrderId=None, phase='clearingBay', pickupProgress=0., stableElapsed=0.,retractProgress=0.)
                    self.event(f"订单 {delivered['id']} 已完成并回收至母车")
            elif u['phase']=='clearingBay':
                u.update(dock(r,u))
                u['retractProgress']=min(1.,u['retractProgress']+dt/.65)
                if u['retractProgress']>=1:u['phase']='parking'
            elif u['phase'] == 'parking':
                goal = carrier_pad(r, u)
                move(u, goal, dt, 5)
                if distance(u, goal) <= .04:
                    u.update(goal, phase='charging' if u['battery'] < .995 else 'docked', missionOrderId=None)
            travelled = distance(u, before)
            if u['phase'] not in HOME_PHASES:
                self.stats['uavDistanceMeters'] += travelled
                self.consume_energy(u, before, dt, mission_order_id)
        delivered = [o for o in self.orders if o['deliveredAt'] is not None]
        completion_times = [o['deliveredAt'] - o['createdAt'] for o in delivered]
        self.stats['totalOrders'] = len(self.orders)
        self.stats['completionRate'] = 100 * len(delivered) / len(self.orders) if self.orders else 0.
        self.stats['averageOrderCompletionSeconds'] = sum(completion_times) / len(completion_times) if completion_times else None
        self.stats['averageDelaySeconds'] = self.stats['averageOrderCompletionSeconds']
        self.stats['averageUavEnergyPerOrderPercent'] = (
            sum(o['energyConsumedPercent'] for o in delivered) / len(delivered) if delivered else None)
        self.stats['stepCount'] += 1
        self.finish_step()

    def finish_step(self):
        all_delivered_and_home = (self.stats['deliveredOrders'] == len(self.orders)
                                  and all(u['phase'] == 'docked' for u in self.uavs)
                                  and self.docking['hatchProgress'] == 0)
        all_home = all(u['phase'] in HOME_PHASES for u in self.uavs)
        if self.emergency_return and all_home and self.docking['hatchProgress'] == 0:
            for u in self.uavs:
                u['enabled'] = (self.emergency_enabled or {}).get(u['id'], True)
            self.emergency_enabled = None
            self.emergency_return = False
            self.running = False
            self.event('紧急返航完成 · 全部无人机已回到母车')
        elif all_delivered_and_home and not self.order_stream_enabled:
            self.running = False
            self.event('本轮订单已全部完成')
        elif all_home and not self.emergency_return:
            # A second admission check includes the energy budget and region.
            self.assign()
            if all(u['phase'] in HOME_PHASES for u in self.uavs):
                has_waiting_order = any(not order['completed'] for order in self.orders)
                charging = any(u['phase'] == 'charging' for u in self.uavs)
                if charging:
                    if not self.events or self.events[-1]['text'] != '无人机充电中 · 等待电量恢复':
                        self.event('无人机充电中 · 等待电量恢复')
                elif self.order_stream_enabled and not has_waiting_order:
                    if not self.events or self.events[-1]['text'] != '订单流运行中 · 等待新订单到达':
                        self.event('订单流运行中 · 等待新订单到达')
                else:
                    self.running = False
                    self.event('本次调度范围已完成或预算不足 · 可继续派发其它区域任务')

    def control(self, command):
        action = command.get('action')
        if action == 'start':
            if self.emergency_return:
                raise ValueError('紧急返航进行中，请等待无人机归位后再继续任务')
            can_resume_stream = self.dynamic_order_stream and len(self.orders) < self.max_orders
            if (self.stats['deliveredOrders'] == len(self.orders) and all(u['phase'] == 'docked' for u in self.uavs)
                    and self.docking['hatchProgress'] == 0 and not can_resume_stream):
                raise ValueError('任务已完成，请先重置')
            self.running = True
            self.configure_order_stream(self.order_stream_area)
        elif action == 'pause':
            if self.emergency_return:
                raise ValueError('紧急返航进行中，不能暂停返航流程')
            self.running = False
        elif action == 'reset':
            self.reset()
        elif action == 'speed':
            value = command.get('value')
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not .3 <= value <= 2:
                raise ValueError('演示速度范围为 0.3–2 倍')
            self.speed = value
        elif action == 'battery_mode':
            value = command.get('value')
            if not isinstance(value, str) or value not in BATTERY_PROFILES:
                raise ValueError('初始电量模式无效')
            if self.running or self.stats['stepCount'] > 0 or any(u['phase'] not in HOME_PHASES for u in self.uavs):
                raise ValueError('初始电量模式只能在任务开始前切换')
            self.battery_mode = value
            self.reset()
        else:
            raise ValueError('不支持的控制指令')
        return {'start': '任务开始 · 无人机从母车起飞', 'pause': '任务暂停', 'reset': '任务重置',
                'speed': '演示速度已更新', 'battery_mode': '初始电量模式已切换'}[action]

    def query_status(self, data):
        query_type = data.get('query_type')
        aliases = {'订单数': 'order_count', '订单数量': 'order_count', '订单统计': 'order_count',
                   '订单详情': 'order_detail', '订单状态': 'order_detail', '设备状态': 'fleet_status',
                   '机队状态': 'fleet_status', '指标': 'metrics', '运行指标': 'metrics', '位置': 'position', '坐标': 'position'}
        query_type = aliases.get(query_type, query_type)
        if query_type == 'order_count':
            delivered = sum(o['status'] == 'delivered' for o in self.orders)
            waiting = sum(not o['completed'] and o['reservedBy'] is None for o in self.orders)
            active = sum(not o['completed'] and o['reservedBy'] is not None for o in self.orders)
            return f'当前共有 {len(self.orders)} 个订单：已完成并回收 {delivered} 个，执行中 {active} 个，待分配 {waiting} 个。'
        if query_type == 'order_detail':
            order_id = data.get('query_order_id', data.get('order_id'))
            if isinstance(order_id, bool) or not isinstance(order_id, int):
                raise ValueError('查询订单详情需要有效订单号')
            order = next((o for o in self.orders if o['id'] == order_id), None)
            if order is None:
                raise ValueError(f'订单 {order_id} 不存在')
            location = f"{order['buildingId']} · {order['floor']}F 阳台" if order['pickupType'] == 'balcony' else f"{order['area']}区中庭"
            assignee = f"UAV {order['reservedBy']}" if order['reservedBy'] is not None else '待分配'
            priority = '加急' if order.get('priority') == 'urgent' else '常规'
            return f"订单 {order_id}：{location}，{priority}，状态 {order['status']}，执行设备 {assignee}。"
        if query_type == 'fleet_status':
            return '当前机队：' + '；'.join(f"UAV {u['id']}：{u['phase']}，电量 {u['battery'] * 100:.0f}%" + (f"，订单 {u['targetOrderId']}" if u['targetOrderId'] is not None else '') for u in self.uavs) + '。'
        if query_type == 'metrics':
            return f"当前指标：完成率 {self.stats['completionRate']:.1f}% ，已回收 {self.stats['deliveredOrders']} 单，累计能耗 {self.stats.get('uavEnergyWh', self.stats.get('energyConsumed', 0)):.2f}。"
        if query_type == 'position':
            agent_id = data.get('query_agent_id', data.get('agent_id'))
            if isinstance(agent_id, int) and 1 <= agent_id <= 3:
                agent_id = f'uav_{agent_id}'
            if agent_id == 'mother':
                point, label = self.rover, 'MOTHER'
            elif isinstance(agent_id, str) and agent_id in ['uav_1', 'uav_2', 'uav_3']:
                point, label = self.uavs[int(agent_id[-1]) - 1], agent_id.upper()
            else:
                raise ValueError('查询位置需要 mother 或 uav_1/uav_2/uav_3')
            x, y, z = [round(value, 2) for value in world(point)]
            return f'{label} 当前坐标：({x}, {y}, {z}) 米。'
        raise ValueError('不支持的查询类型')

    def command(self, data):
        action = data.get('action_type')
        if action == 'query_status':
            return self.query_status(data)
        if action not in ['dispatch', 'emergency_stop', 'optimize_energy']:
            raise ValueError('调度类型无效')
        if self.emergency_return and action != 'emergency_stop':
            raise ValueError('紧急返航进行中，请等待无人机归位后再派发任务')
        area = data.get('target_area')
        if area not in ['A', 'B', 'C', None]:
            raise ValueError('目标区域无效')
        ids = data.get('assign_agents', ['all'])
        if not isinstance(ids, list) or not ids or any(i not in ['all', 'mother', 'uav_1', 'uav_2', 'uav_3'] for i in ids):
            raise ValueError('设备列表无效')
        limit = data.get('energy_limit')
        if limit is not None and (isinstance(limit, bool) or not isinstance(limit, (int, float)) or not 0 < limit <= 100):
            raise ValueError('能耗上限必须大于0且不超过100')
        priority = data.get('priority', 'normal')
        if priority not in ['normal', 'urgent']:
            raise ValueError('优先级无效')
        order_ids = data.get('order_ids')
        if order_ids is not None and (not isinstance(order_ids, list) or not order_ids or any(isinstance(i, bool) or not isinstance(i, int) or i < 1 for i in order_ids) or len(set(order_ids)) != len(order_ids)):
            raise ValueError('order_ids 必须是去重后的正整数数组')
        known = {o['id']: o for o in self.orders}
        if order_ids is not None:
            missing = [i for i in order_ids if i not in known]
            if missing:
                raise ValueError(f'订单不存在：{", ".join(map(str, missing))}')
        target_position = data.get('target_position')
        normalized_target = normalise_world_position(target_position) if target_position is not None else None
        if action != 'emergency_stop' and not any(i in ids for i in ['all', 'uav_1', 'uav_2', 'uav_3']):
            raise ValueError('取件调度需要至少一架无人机')
        if action == 'emergency_stop':
            if self.emergency_enabled is None:
                self.emergency_enabled = {u['id']: u['enabled'] for u in self.uavs}
            self.emergency_return = True
            self.order_stream_enabled = False
            self.stats['orderStreamActive'] = False
            self.next_order_at = None
            for u in self.uavs:
                u.update(enabled=False, preferredArea=None, preferredOrderIds=None, energyLimit=None, commandTarget=None)
                if u['cargoOrderId'] is not None:
                    continue
                if u['targetOrderId'] is not None:
                    order = next((o for o in self.orders if o['id'] == u['targetOrderId']), None)
                    if order and not order['completed']:
                        order.update(reservedBy=None, status='waiting')
                u.update(targetOrderId=None, missionOrderId=None, phase='parking', stableElapsed=0., pickupProgress=0.)
            self.running = True
            message = '紧急返航已启动 · 无人机返回母车，当前订单进度已保留'
        else:
            self.energy_mode = action == 'optimize_energy'
            selected_ids = {u['id'] for u in self.uavs if 'all' in ids or f"uav_{u['id']}" in ids}
            if normalized_target is not None and len(selected_ids) != 1:
                raise ValueError('target_position 只能指派一架无人机')
            scoped = [o for o in self.orders if not o['completed'] and (area is None or o['area'] == area) and (order_ids is None or o['id'] in order_ids)]
            if order_ids is not None and not scoped:
                raise ValueError('指定订单已完成或不属于当前调度范围')
            for order in scoped:
                order['priority'] = priority
            for u in self.uavs:
                selected = 'all' in ids or f"uav_{u['id']}" in ids
                # Finish an already loaded parcel; never delete in-flight cargo.
                if u['cargoOrderId'] is None:
                    order = next((o for o in self.orders if o['id'] == u['targetOrderId']), None)
                    if order and u['phase'] != 'picking' and (normalized_target is not None or not selected or priority == 'urgent' or (area and order['area'] != area) or (order_ids is not None and order['id'] not in order_ids)):
                        order.update(reservedBy=None, status='waiting')
                        u.update(targetOrderId=None, missionOrderId=None, phase='parking', stableElapsed=0.)
                if selected:
                    if normalized_target is None and u.get('commandTarget') is not None and u['cargoOrderId'] is None:
                        u['phase'] = 'parking'
                    u.update(commandTarget=normalized_target if normalized_target is not None else None,
                             preferredOrderIds=order_ids, preferredArea=area)
                    if normalized_target is not None:
                        if u['cargoOrderId'] is not None:
                            raise ValueError(f'UAV {u["id"]} 正在携货返航，不能切换到坐标指令')
                        u.update(targetOrderId=None, missionOrderId=None, phase='cruising', stableElapsed=0., pickupProgress=0.)
                else:
                    u.update(commandTarget=None, preferredOrderIds=None, preferredArea=None)
                u.update(enabled=selected, energyLimit=limit, missionEnergy=0.)
            self.running = True
            if normalized_target is not None:
                self.order_stream_enabled = False; self.stats['orderStreamActive'] = False; self.next_order_at = None
                x, y, z = [round(value, 1) for value in world(normalized_target)]
                message = f"AI 坐标调度已执行 · UAV {next(iter(selected_ids))} · 目标 ({x}, {y}, {z})m"
            else:
                self.configure_order_stream(area)
                message = f"{'节能调度' if self.energy_mode else ('加急' if priority == 'urgent' else '常规') + '取件调度'}已执行 · {area + '区' if area else '全园区'} · {', '.join(ids)}"
        self.last_command = copy.deepcopy(data)
        self.event(message)
        return message

    def snapshot(self, health):
        self.seq += 1
        def pose(p):
            result = {k: v for k, v in p.items() if k not in ['x', 'y', 'z', 'stableElapsed', 'commandTarget']}
            if p.get('commandTarget') is not None:
                result['commandTargetPosition'] = world(p['commandTarget'])
            return result | {'position': world(p)}
        return dict(schema_version=1, epoch=self.epoch, seq=self.seq, timestamp=time.time() * 1000,
                    coordinate_system='campus_meters_xy_height', running=self.running, speed=self.speed,
                    batteryMode=self.battery_mode, emergencyReturn=self.emergency_return,
                    elapsedSeconds=self.elapsed, rover=pose(self.rover), uavs=[pose(u) for u in self.uavs],
                    orders=[pose(o) for o in self.orders], stats=self.stats.copy(), health=health,
                    docking=copy.deepcopy(self.docking),
                    events=copy.deepcopy(self.events), lastCommand=self.last_command)
