"""Authoritative mission world. Normalized inputs match upstream trained actors.

Only the wire/rendering boundary uses metres [horizontal x, horizontal y, height].
No renderer feedback or browser timer participates in arrival or completion.
"""
import copy
import json
import math
import time
import uuid
from pathlib import Path


PICKUP_LOCATIONS = json.loads((Path(__file__).resolve().parents[1] / 'src' / 'core' / 'campusPickupLocations.json').read_text(encoding='utf-8'))


def world(p):
    return [p['x'] * 200 - 100, p['y'] * 200 - 100, p.get('z', 0) * 50]


def distance(a, b):
    return math.dist(world(a), world(b))


def pickup(order):
    return dict(x=order['x'], y=order['y'], z=order['z'] + .95 / 50)


def dock(rover, uav):
    heading = rover.get('heading', 0)
    return dict(x=rover['x'] - .15 * math.sin(heading) / 200,
                y=rover['y'] - .15 * math.cos(heading) / 200, z=2.63 / 50)


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


class Mission:
    def __init__(self):
        self.reset()

    def reset(self):
        self.epoch = uuid.uuid4().hex
        self.seq = 0
        self.running = False
        self.speed = .7
        self.elapsed = 0
        self.rover = dict(x=.5, y=.5, z=0, heading=0)
        self.docking = dict(owner=None, queue=[], hatchProgress=0., stage='closed')
        self.uavs = [dict(id=i + 1, x=x, y=.5, z=.05, battery=1., phase='idle', targetOrderId=None,
                          cargoOrderId=None, stableElapsed=0., pickupProgress=0., unloadProgress=0.,
                          enabled=True, preferredArea=None, energyLimit=None, missionEnergy=0.,retractProgress=0.)
                     for i, x in enumerate([.5, .55, .45])]
        self.orders = []
        for location in PICKUP_LOCATIONS:
            x, height, z = location['position']
            bx, by = (x + 100) / 200, (z + 100) / 200
            self.orders.append(dict(id=location['id'], x=bx, y=by, z=height / 50,
                                    pickupType=location['pickupType'], buildingId=location.get('buildingId'),
                                    floor=location.get('floor'), area=('A' if by < .4 else 'B' if by > .6 else 'C'),
                                    completed=False, status='waiting', reservedBy=None, deliveredAt=None))
        self.stats = dict(stepCount=0, completedOrders=0, deliveredOrders=0, uavDistanceMeters=0.,
                          roverDistanceMeters=0., energyConsumed=0., averageDelaySeconds=None)
        self.events = []
        self.last_command = None
        self.energy_mode = False

    def event(self, text):
        self.events.append(dict(time=round(self.elapsed, 1), text=text))
        self.events = self.events[-12:]

    def assign(self):
        for u in self.uavs:
            if not u['enabled'] or u['phase'] != 'idle' or u['cargoOrderId'] is not None or u['targetOrderId'] is not None:
                continue
            choices = [o for o in self.orders if not o['completed'] and o['reservedBy'] is None]
            if u['preferredArea']:
                choices = [o for o in choices if o['area'] == u['preferredArea']]
            if u['energyLimit'] is not None and u['missionEnergy'] >= u['energyLimit']:
                continue
            if not choices:
                continue
            order = min(choices, key=lambda o: distance(u, pickup(o)))
            estimated = (distance(u, pickup(order)) + distance(pickup(order), dock(self.rover, u))) / 3.5 * (.003 / .52 * 100) + 3
            if u['energyLimit'] is not None and u['missionEnergy'] + estimated > u['energyLimit']:
                continue
            order.update(reservedBy=u['id'], status='enroute')
            u.update(targetOrderId=order['id'], phase='takingOff' if u['z']<.05 else 'cruising', stableElapsed=0., pickupProgress=0.)
            self.event(f"UAV {u['id']} 分配包裹 {order['id']} · {order['area']}区")

    def observations(self):
        waiting = [o for o in self.orders if not o['completed']]
        center = {k: sum(o[k] for o in waiting) / len(waiting) if waiting else .5 for k in ['x', 'y']}
        r = self.rover
        result = {'mother': [r['x'], r['y'], center['x'] - r['x'], center['y'] - r['y'],
                             len(waiting) / len(self.orders), sum(u['battery'] for u in self.uavs) / 3]}
        for u in self.uavs:
            order = next((o for o in self.orders if o['id'] == u['targetOrderId']), None)
            target = pickup(order) if order else dock(r, u)
            result[f"uav_{u['id']}"] = [u['x'], u['y'], u['z'], u['battery'], r['x'] - u['x'],
                                        r['y'] - u['y'], -u['z'], target['x'] - u['x'],
                                        target['y'] - u['y'], target['z'] - u['z']]
        return result

    def advance(self, dt, actions):
        if not self.running:
            return
        self.elapsed += dt
        self.assign()
        r = self.rover
        old_rover = r.copy()
        active = [u for u in self.uavs if (u['cargoOrderId'] is not None and u['phase'] in ['returning', 'waitingDock', 'unloading'])
                  or u['phase']=='clearingBay' or (u['phase']=='parking' and distance(u,dock(r,u))<=2)]
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
        docking = self.docking['hatchProgress'] > 0 or any(u['phase'] == 'parking' or
                  (u['phase'] in ['returning', 'waitingDock'] and distance(u, dock(r, u)) <= 8) for u in self.uavs)
        if not docking:
            a = actions.get('mother', [0, 0])
            for k, value in zip(['x', 'y'], a):
                r[k] = max(.35, min(.65, r[k] + value * .0075 * dt / .52))
        if distance(r, old_rover) > .0001:
            r['heading'] = math.atan2(r['x'] - old_rover['x'], r['y'] - old_rover['y'])
        self.stats['roverDistanceMeters'] += distance(r, old_rover)
        for u in self.uavs:
            before = u.copy()
            order = next((o for o in self.orders if o['id'] == u['targetOrderId'] and not o['completed']), None)
            if order and u['phase']=='takingOff':
                move(u,dict(x=u['x'],y=u['y'],z=.05),dt,0)
                if abs(u['z']-.05)*50<=.005:u.update(z=.05,phase='cruising')
            if order and u['phase'] in ['cruising', 'approaching']:
                goal = pickup(order)
                dist = distance(u, goal)
                if dist <= 18 or u['phase'] == 'approaching':
                    u['phase'] = 'approaching'
                    order['status'] = 'approaching'
                    move(u, goal, dt, min(3, max(.25, dist * .9)))
                else:
                    a = actions.get(f"uav_{u['id']}", [0, 0, 0])
                    candidate = dict(x=max(0, min(1, u['x'] + a[0] * .015 * dt / .52)),
                                     y=max(0, min(1, u['y'] + a[1] * .015 * dt / .52)),
                                     z=max(.05, min(.12, u['z'] + a[2] * .015 * dt / .52)))
                    if dist - distance(candidate, goal) >= .05 * dt:
                        u.update(candidate)
                    else:
                        move(u, {**goal, 'z': max(.05, goal['z'])}, dt, 3.5 if self.energy_mode else 5)
            velocity = distance(u, before) / dt
            if order:
                if aligned(u, order, velocity):
                    if u['phase'] != 'picking':
                        u['phase'] = order['status'] = 'aligning'
                        u['stableElapsed'] += dt
                        if u['stableElapsed'] >= .8:
                            u['phase'] = order['status'] = 'picking'
                            self.event(f"UAV {u['id']} 悬停确认 · 装载包裹 {order['id']}")
                    else:
                        u['pickupProgress'] = min(1, u['pickupProgress'] + dt / 3)
                        if u['pickupProgress'] >= 1:
                            order.update(completed=True, status='collected')
                            self.stats['completedOrders'] += 1
                            u.update(cargoOrderId=order['id'], targetOrderId=None, phase='returning', unloadProgress=0.)
                            self.event(f"包裹 {order['id']} 已装载 · UAV {u['id']} 返航")
                elif u['phase'] in ['aligning', 'picking']:
                    u.update(phase='approaching', stableElapsed=0., pickupProgress=0.)
                    order['status'] = 'approaching'
            if u['phase'] in ['returning', 'waitingDock']:
                owns_bay = u['id'] == self.docking['owner']
                u['phase'] = 'returning' if owns_bay else 'waitingDock'
                goal = dock(r, u) if owns_bay else stand(r, u, waiting=True)
                move(u, goal, dt, 3.5 if self.energy_mode else 5)
                if owns_bay and distance(u, goal) <= .08 and self.docking['hatchProgress'] >= 1:
                    u.update(goal)
                    u.update(phase='unloading', unloadProgress=0.)
                    self.event(f"UAV {u['id']} 到达母车 · 包裹入舱")
            elif u['phase'] == 'unloading':
                u.update(dock(r, u))
                u['unloadProgress'] = min(1, u['unloadProgress'] + dt / 1.5)
                if u['unloadProgress'] >= 1:
                    delivered = next(o for o in self.orders if o['id'] == u['cargoOrderId'])
                    delivered.update(status='delivered', deliveredAt=self.elapsed)
                    self.stats['deliveredOrders'] += 1
                    u.update(cargoOrderId=None, phase='clearingBay', pickupProgress=0., stableElapsed=0.,retractProgress=0.)
                    self.event(f"包裹 {delivered['id']} 已回收至母车")
            elif u['phase']=='clearingBay':
                u.update(dock(r,u))
                u['retractProgress']=min(1.,u['retractProgress']+dt/.65)
                if u['retractProgress']>=1:u['phase']='parking'
            elif u['phase'] == 'parking':
                goal = stand(r, u)
                move(u, goal, dt, 5)
                if distance(u, goal) <= .04:
                    u.update(goal, phase='idle')
            travelled = distance(u, before)
            self.stats['uavDistanceMeters'] += travelled
            if u['phase'] != 'idle':
                cost = .003 * dt / .52 * (0.8 if self.energy_mode else 1)
                used = min(u['battery'], cost)
                u['battery'] -= used
                u['missionEnergy'] += used * 100
                self.stats['energyConsumed'] += used * 100
            if u['phase'] == 'idle' and distance(u, stand(r, u)) <= .2:
                u['battery'] = min(1, u['battery'] + dt * .05)
        delays = [o['deliveredAt'] for o in self.orders if o['deliveredAt'] is not None]
        self.stats['averageDelaySeconds'] = sum(delays) / len(delays) if delays else None
        self.stats['stepCount'] += 1
        if self.stats['deliveredOrders'] == len(self.orders) and all(u['phase'] == 'idle' for u in self.uavs) and self.docking['hatchProgress'] == 0:
            self.running = False
            self.event('全部包裹已回收 · 任务完成')
        elif all(u['phase'] == 'idle' for u in self.uavs):
            # A second admission check includes the energy budget and region.
            self.assign()
            if all(u['phase'] == 'idle' for u in self.uavs):
                self.running = False
                self.event('本次调度范围已完成或预算不足 · 可继续派发其它区域任务')

    def control(self, command):
        action = command.get('action')
        if action == 'start':
            if self.stats['deliveredOrders'] == len(self.orders) and all(u['phase'] == 'idle' for u in self.uavs) and self.docking['hatchProgress'] == 0:
                raise ValueError('任务已完成，请先重置')
            self.running = True
        elif action == 'pause':
            self.running = False
        elif action == 'reset':
            self.reset()
        elif action == 'speed':
            value = command.get('value')
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not .3 <= value <= 2:
                raise ValueError('演示速度范围为 0.3–2 倍')
            self.speed = value
        else:
            raise ValueError('不支持的控制指令')
        return {'start': '任务开始', 'pause': '任务暂停', 'reset': '任务重置', 'speed': '演示速度已更新'}[action]

    def command(self, data):
        action = data.get('action_type')
        if action not in ['dispatch', 'emergency_stop', 'optimize_energy']:
            raise ValueError('调度类型无效')
        area = data.get('target_area')
        if area not in ['A', 'B', 'C', None]:
            raise ValueError('目标区域无效')
        ids = data.get('assign_agents', ['all'])
        if not isinstance(ids, list) or not ids or any(i not in ['all', 'mother', 'uav_1', 'uav_2', 'uav_3'] for i in ids):
            raise ValueError('设备列表无效')
        limit = data.get('energy_limit')
        if limit is not None and (isinstance(limit, bool) or not isinstance(limit, (int, float)) or not 0 < limit <= 100):
            raise ValueError('能耗上限必须大于0且不超过100')
        if data.get('priority', 'normal') not in ['normal', 'urgent']:
            raise ValueError('优先级无效')
        if action != 'emergency_stop' and not any(i in ids for i in ['all', 'uav_1', 'uav_2', 'uav_3']):
            raise ValueError('取件调度需要至少一架无人机')
        if action == 'emergency_stop':
            self.running = False
            message = '集群紧急停止 · 位置和任务进度已保留'
        else:
            self.energy_mode = action == 'optimize_energy'
            for u in self.uavs:
                selected = 'all' in ids or f"uav_{u['id']}" in ids
                # Finish an already loaded parcel; never delete in-flight cargo.
                if u['cargoOrderId'] is None:
                    order = next((o for o in self.orders if o['id'] == u['targetOrderId']), None)
                    if order and u['phase'] != 'picking' and (not selected or data.get('priority') == 'urgent' or (area and order['area'] != area)):
                        order.update(reservedBy=None, status='waiting')
                        u.update(targetOrderId=None, phase='idle', stableElapsed=0.)
                u.update(enabled=selected, preferredArea=area if selected else None, energyLimit=limit, missionEnergy=0.)
            self.running = True
            message = f"{'节能调度' if self.energy_mode else '取件调度'}已执行 · {area + '区' if area else '全园区'} · {', '.join(ids)}"
        self.last_command = copy.deepcopy(data)
        self.event(message)
        return message

    def snapshot(self, health):
        self.seq += 1
        def pose(p):
            return {k: v for k, v in p.items() if k not in ['x', 'y', 'z', 'stableElapsed']} | {'position': world(p)}
        return dict(schema_version=1, epoch=self.epoch, seq=self.seq, timestamp=time.time() * 1000,
                    coordinate_system='campus_meters_xy_height', running=self.running, speed=self.speed,
                    elapsedSeconds=self.elapsed, rover=pose(self.rover), uavs=[pose(u) for u in self.uavs],
                    orders=[pose(o) for o in self.orders], stats=self.stats.copy(), health=health,
                    docking=copy.deepcopy(self.docking),
                    events=copy.deepcopy(self.events), lastCommand=self.last_command)
