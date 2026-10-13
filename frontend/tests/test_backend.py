import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from mission import Mission, aligned, pickup, world
from service import Policy


class BackendMissionTests(unittest.TestCase):
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

    def test_pause_and_emergency_stop_freeze_business_state(self):
        m = Mission()
        m.running = True
        m.advance(.05, {})
        m.control({'action': 'pause'})
        before = copy.deepcopy(m.__dict__)
        m.advance(100, {'mother': [1, 1]})
        self.assertEqual(m.__dict__, before)
        m.command({'action_type': 'emergency_stop', 'assign_agents': ['all']})
        self.assertFalse(m.running)

    def test_dispatch_targets_selected_agents_and_region(self):
        m = Mission()
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
        m = Mission()
        m.command({'action_type': 'dispatch', 'target_area': 'B', 'assign_agents': ['uav_1', 'uav_3'], 'priority': 'urgent'})
        for _ in range(4000):
            m.advance(.05, {})
            if not m.running:
                break
        self.assertEqual(m.stats['deliveredOrders'], 3)
        self.assertTrue(all(o['status'] == 'delivered' for o in m.orders if o['area'] == 'B'))
        self.assertTrue(all(not o['completed'] for o in m.orders if o['area'] != 'B'))

    def test_real_four_onnx_models_complete_all_deliveries(self):
        policy = Policy()
        m = Mission()
        m.control({'action': 'start'})
        for step in range(10000):
            if step % 10 == 0:
                m.assign()
                actions = policy.infer(m.observations())
            m.advance(.05, actions)
            if m.stats['deliveredOrders'] == 8:
                break
        self.assertEqual(m.stats['completedOrders'], 8)
        self.assertEqual(m.stats['deliveredOrders'], 8)
        self.assertFalse(m.running)
        self.assertTrue(all(o['status'] == 'delivered' for o in m.orders))
        self.assertTrue(all(u['cargoOrderId'] is None for u in m.uavs))
        self.assertGreater(policy.count, 0)
        print(f"Real ONNX mission: {m.elapsed:.1f}s simulation, {policy.count} inference batches, {m.stats['uavDistanceMeters']:.1f}m UAV distance")


if __name__ == '__main__':
    unittest.main()
