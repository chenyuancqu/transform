import copy
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from mission import Mission, PICKUP_LOCATIONS, aligned, pickup, world, distance, dock, stand, carrier_pad
from service import Policy


class BackendMissionTests(unittest.TestCase):
    def test_shared_parcel_locations_reach_backend_snapshot_unchanged(self):
        m = Mission(order_count=8, rng=random.Random(7))
        snapshot = m.snapshot({'status': 'ok'})
        self.assertEqual(len([o for o in m.orders if o['pickupType'] == 'balcony']), 6)
        self.assertEqual(len([o for o in m.orders if o['pickupType'] == 'courtyard']), 2)
        self.assertEqual({o['area'] for o in m.orders}, {'A', 'B', 'C'})
        for order, encoded in zip(m.orders, snapshot['orders']):
            # The shared layout uses Three.js [x, height, z]; the backend wire
            # pose uses its documented [x, horizontal-y, height] convention.
            location = next(item for item in PICKUP_LOCATIONS
                            if world(order) == [item['position'][0], item['position'][2], item['position'][1]])
            wire_position = [location['position'][0], location['position'][2], location['position'][1]]
            self.assertEqual(world(order), wire_position)
            self.assertEqual(encoded['position'], wire_position)
            self.assertEqual(encoded['pickupType'], location['pickupType'])
            self.assertEqual(encoded.get('buildingId'), location.get('buildingId'))
            self.assertEqual(encoded.get('floor'), location.get('floor'))

    def test_order_count_and_grounded_locations_are_randomized_per_mission(self):
        missions = [Mission(rng=random.Random(seed)) for seed in range(20)]
        sizes = {len(mission.orders) for mission in missions}
        placements = {tuple(world(order)) for mission in missions for order in mission.orders}
        self.assertGreater(len(sizes), 1)
        self.assertTrue(all(4 <= len(mission.orders) <= 8 for mission in missions))
        for mission in missions:
            self.assertEqual({order['area'] for order in mission.orders}, {'A', 'B', 'C'})
            self.assertGreaterEqual(sum(order['area'] == 'B' for order in mission.orders), 2)
            self.assertEqual(len({tuple(world(order)) for order in mission.orders}), len(mission.orders))
            self.assertTrue(all(any(world(order) == [location['position'][0], location['position'][2], location['position'][1]]
                                for location in PICKUP_LOCATIONS)
                                for order in mission.orders))
        self.assertEqual(len(placements), len(PICKUP_LOCATIONS))
        mission = Mission(rng=random.Random(31))
        previous_epoch = mission.epoch
        previous = {tuple(world(order)) for order in mission.orders}
        mission.reset()
        self.assertNotEqual(mission.epoch, previous_epoch)
        self.assertTrue(all(any(world(order) == [location['position'][0], location['position'][2], location['position'][1]]
                            for location in PICKUP_LOCATIONS)
                            for order in mission.orders))
        self.assertNotEqual({tuple(world(order)) for order in mission.orders}, previous)

    def test_running_order_stream_adds_orders_only_on_free_grounded_anchors(self):
        mission = Mission(rng=random.Random(44), max_orders=12)
        first = mission.orders[0]
        first.update(completed=True, status='collected')
        occupied = {order['locationId'] for order in mission.orders if not order['completed']}
        initial_count = len(mission.orders)
        mission.running = True
        mission.order_stream_enabled = True
        mission.next_order_at = 0.
        mission.advance(.05, {})
        self.assertEqual(len(mission.orders), initial_count + 1)
        created = mission.orders[-1]
        self.assertEqual(created['id'], initial_count + 1)
        self.assertEqual(created['createdAt'], mission.elapsed)
        self.assertNotIn(created['locationId'], occupied)
        self.assertTrue(any(world(created) == [location['position'][0], location['position'][2], location['position'][1]]
                            for location in PICKUP_LOCATIONS))
        self.assertEqual(mission.stats['totalOrders'], len(mission.orders))
        self.assertGreater(mission.next_order_at, mission.elapsed)

    def test_area_dispatch_stream_keeps_new_orders_inside_selected_region(self):
        mission = Mission(rng=random.Random(46), max_orders=12)
        for order in mission.orders:
            if order['area'] == 'B':
                order['completed'] = True
        mission.order_stream_area = 'B'
        spawned = mission.spawn_order()
        self.assertTrue(spawned)
        self.assertEqual(mission.orders[-1]['area'], 'B')
        self.assertTrue(any(order['area'] == 'B' and not order['completed'] for order in mission.orders))

    def test_low_battery_uav_waits_at_home_and_recharges_before_dispatch(self):
        mission = Mission(order_count=4, rng=random.Random(45))
        uav = mission.uavs[0]
        uav.update(stand(mission.rover, uav), battery=.1, phase='parking')
        for other in mission.uavs[1:]:
            other['enabled'] = False
        mission.assign()
        self.assertIsNone(uav['targetOrderId'])
        mission.running = True
        for _ in range(100):
            mission.advance(.05, {})
            if uav['phase'] == 'charging':
                break
        self.assertEqual(uav['phase'], 'charging')
        self.assertLess(distance(uav, carrier_pad(mission.rover, uav)), .04)
        mission.advance(.5, {})
        self.assertGreater(uav['battery'], .1)
        self.assertIsNone(uav['targetOrderId'])
        for _ in range(100):
            mission.advance(.5, {})
            if uav['targetOrderId'] is not None:
                break
        self.assertIsNotNone(uav['targetOrderId'])
        order = next(order for order in mission.orders if order['id'] == uav['targetOrderId'])
        estimated = (distance(uav, pickup(order)) + distance(pickup(order), dock(mission.rover, uav))) \
            / 3.5 * (.003 / .52 * 100) + 3
        self.assertGreaterEqual(uav['battery'] * 100 + 1e-6, estimated + 5)

    def test_arrival_requires_precise_pose_and_low_speed(self):
        m = Mission()
        order = m.orders[0]
        u = pickup(order)
        self.assertTrue(aligned(u, order, 0))
        self.assertFalse(aligned({**u, 'x': u['x'] + 16 / 200}, order, 0))
        self.assertFalse(aligned({**u, 'z': u['z'] + .21 / 50}, order, 0))
        self.assertFalse(aligned(u, order, .151))

    def test_dwell_and_pickup_time_are_backend_authoritative(self):
        m = Mission()
        m.running = True
        m.assign()
        u = m.uavs[0]
        order = next(o for o in m.orders if o['id'] == u['targetOrderId'])
        u.update(pickup(order), phase='approaching')
        for _ in range(15):
            m.advance(.05, {})
        self.assertEqual(u['phase'], 'aligning')
        m.advance(.05, {})
        self.assertEqual(u['phase'], 'picking')
        for _ in range(59):
            m.advance(.05, {})
        self.assertFalse(order['completed'])
        m.advance(.05, {})
        self.assertTrue(order['completed'])
        self.assertEqual(u['cargoOrderId'], order['id'])

    def test_pause_freezes_but_emergency_stop_returns_home(self):
        m = Mission()
        m.running = True
        m.advance(.05, {})
        m.control({'action': 'pause'})
        before = {key: copy.deepcopy(value) for key, value in m.__dict__.items() if key != 'rng'}
        m.advance(100, {'mother': [1, 1]})
        self.assertEqual({key: value for key, value in m.__dict__.items() if key != 'rng'}, before)
        m.command({'action_type': 'emergency_stop', 'assign_agents': ['all']})
        self.assertTrue(m.running)
        self.assertTrue(m.emergency_return)
        for _ in range(400):
            m.advance(.05, {})
            if not m.running:
                break
        self.assertFalse(m.running)
        self.assertFalse(m.emergency_return)
        self.assertTrue(all(u['phase'] in ('charging', 'docked') for u in m.uavs))

    def test_dispatch_targets_selected_agents_and_region(self):
        m = Mission(order_count=8, rng=random.Random(12))
        m.command({'action_type': 'dispatch', 'target_area': 'B', 'priority': 'urgent', 'assign_agents': ['uav_1', 'uav_3']})
        m.assign()
        self.assertIsNone(m.uavs[1]['targetOrderId'])
        for u in [m.uavs[0], m.uavs[2]]:
            self.assertEqual(next(o for o in m.orders if o['id'] == u['targetOrderId'])['area'], 'B')
        self.assertEqual(len({u['targetOrderId'] for u in m.uavs if u['targetOrderId']}), 2)

    def test_validation_and_epoch_reset(self):
        m = Mission()
        for command in [{'action': 'speed', 'value': float('nan')}, {'action': 'speed', 'value': True}, {'action': 'bad'}]:
            with self.assertRaises(ValueError):
                m.control(command)
        epoch = m.epoch
        m.control({'action': 'reset'})
        self.assertNotEqual(m.epoch, epoch)
        self.assertEqual(world(m.rover), [0, 0, 0])
        self.assertEqual(m.snapshot({})['coordinate_system'], 'campus_meters_xy_height')

    def test_budget_rejects_new_work_and_loaded_cargo_survives_reassignment(self):
        m = Mission()
        m.command({'action_type': 'optimize_energy', 'assign_agents': ['all'], 'energy_limit': .01})
        m.advance(.05, {})
        self.assertFalse(m.running)
        self.assertTrue(all(u['targetOrderId'] is None for u in m.uavs))
        m.reset()
        m.running = True
        m.assign()
        u = m.uavs[0]
        order = next(o for o in m.orders if o['id'] == u['targetOrderId'])
        u.update(cargoOrderId=order['id'], targetOrderId=None, phase='returning')
        order.update(completed=True, status='collected')
        m.command({'action_type': 'dispatch', 'target_area': 'A', 'assign_agents': ['uav_2'], 'priority': 'urgent'})
        self.assertEqual(u['cargoOrderId'], order['id'])
        self.assertEqual(u['phase'], 'returning')

    def test_region_task_stops_when_selected_scope_is_delivered(self):
        m = Mission(order_count=8, rng=random.Random(13))
        expected_b_orders = sum(o['area'] == 'B' for o in m.orders)
        m.command({'action_type': 'dispatch', 'target_area': 'B', 'assign_agents': ['uav_1', 'uav_3'], 'priority': 'urgent'})
        for _ in range(4000):
            m.advance(.05, {})
            if not m.running:
                break
        self.assertEqual(m.stats['deliveredOrders'], expected_b_orders)
        self.assertTrue(all(o['status'] == 'delivered' for o in m.orders if o['area'] == 'B'))
        self.assertTrue(all(not o['completed'] for o in m.orders if o['area'] != 'B'))

    def test_real_four_onnx_models_complete_all_deliveries(self):
        policy = Policy()
        m = Mission(rng=random.Random(14), max_orders=12)
        m.control({'action': 'start'})
        for step in range(10000):
            if step % 10 == 0:
                m.assign()
                actions = policy.infer(m.observations())
            m.advance(.05, actions)
            if not m.running:
                break
        self.assertEqual(m.stats['completedOrders'], m.max_orders)
        self.assertEqual(m.stats['deliveredOrders'], m.max_orders)
        self.assertEqual(m.stats['totalOrders'], m.max_orders)
        self.assertEqual(m.stats['completionRate'], 100.)
        self.assertGreater(m.stats['averageOrderCompletionSeconds'], 0)
        self.assertGreater(m.stats['averageUavEnergyPerOrderPercent'], 0)
        self.assertEqual(m.stats['averageDelaySeconds'], m.stats['averageOrderCompletionSeconds'])
        self.assertFalse(m.running)
        self.assertTrue(all(o['status'] == 'delivered' for o in m.orders))
        self.assertTrue(all(u['cargoOrderId'] is None for u in m.uavs))
        self.assertGreater(policy.count, 0)
        print(f"Real ONNX mission: {m.elapsed:.1f}s simulation, {policy.count} inference batches, {m.stats['uavDistanceMeters']:.1f}m UAV distance")

    def test_uavs_start_on_roof_and_take_off_vertically(self):
        m=Mission();m.running=True
        u=m.uavs[0]
        self.assertEqual(u['phase'], 'docked')
        self.assertEqual((u['x'],u['y'],u['z']), tuple(carrier_pad(m.rover,u).values()))
        m.assign();self.assertEqual(u['phase'],'takingOff')
        original=(u['x'],u['y'])
        for _ in range(30):
            before=world(u)[2];m.advance(.05,{})
            self.assertEqual((u['x'],u['y']),original)
            self.assertLessEqual(world(u)[2]-before,.060001)
        self.assertEqual(u['phase'],'takingOff')
        for _ in range(60):m.advance(.05,{})
        self.assertEqual(u['phase'],'cruising')

    def test_imbalanced_battery_profile_can_only_be_selected_before_start(self):
        m=Mission(order_count=4,rng=random.Random(83))
        old_epoch=m.epoch
        m.control({'action':'battery_mode','value':'imbalanced'})
        self.assertNotEqual(m.epoch,old_epoch)
        self.assertEqual(m.snapshot({})['batteryMode'],'imbalanced')
        self.assertEqual([round(u['battery']*100) for u in m.uavs],[42,68,91])
        self.assertTrue(all(u['phase']=='charging' for u in m.uavs))
        m.running=True;m.advance(.05,{})
        with self.assertRaises(ValueError):m.control({'action':'battery_mode','value':'balanced'})

    def test_charging_uav_follows_rover_on_roof_pad(self):
        m=Mission(order_count=4,rng=random.Random(84))
        u=m.uavs[0]
        for drone in m.uavs: drone['enabled']=False
        u.update(battery=.5,phase='charging')
        m.running=True
        m.advance(.05,{'mother':[1.,0.]})
        expected=carrier_pad(m.rover,u)
        self.assertAlmostEqual(u['x'],expected['x'])
        self.assertAlmostEqual(u['y'],expected['y'])
        self.assertAlmostEqual(u['z'],expected['z'])
        self.assertGreater(m.stats['roverDistanceMeters'],0)

    def test_single_bay_queue_hatch_pause_and_resume(self):
        m = Mission(order_count=8, rng=random.Random(15))
        m.running = True
        m.assign()
        cargo_ids = []
        for u in m.uavs:
            order = next(o for o in m.orders if o['id'] == u['targetOrderId'])
            order.update(completed=True, status='collected')
            cargo_ids.append(order['id'])
            u.update(dock(m.rover,u),cargoOrderId=order['id'],targetOrderId=None,phase='returning')
        m.stats['completedOrders'] = 3
        m.advance(.05,{})
        self.assertLessEqual(sum(u['phase']=='unloading' for u in m.uavs),1)
        self.assertEqual(sum(u['phase']=='waitingDock' for u in m.uavs),2)
        self.assertEqual(m.docking['owner'],1)
        m.control({'action':'pause'})
        before={key:copy.deepcopy(value) for key,value in m.__dict__.items() if key!='rng'}
        m.advance(20,{})
        self.assertEqual({key:value for key,value in m.__dict__.items() if key!='rng'},before)
        m.control({'action':'start'})
        for _ in range(4500):
            m.advance(.05,{})
            active=[u for u in m.uavs if u['phase']=='unloading']
            self.assertLessEqual(len(active),1)
            if active:
                self.assertEqual(active[0]['id'],m.docking['owner'])
                self.assertEqual(m.docking['hatchProgress'],1)
            if not m.running:break
        self.assertEqual(m.stats['deliveredOrders'],8)
        self.assertEqual(m.docking['queue'],[])
        self.assertEqual(m.docking['hatchProgress'],0)
        self.assertTrue(all(u['phase']=='docked' for u in m.uavs))
        self.assertTrue(all(o['status']=='delivered' for o in m.orders if o['id'] in cargo_ids))
        self.assertGreater(min(__import__('math').dist(world(a),world(b)) for i,a in enumerate(m.uavs) for b in m.uavs[i+1:]),.9)


if __name__ == '__main__':
    unittest.main()
