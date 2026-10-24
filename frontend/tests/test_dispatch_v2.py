import copy
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from dispatch_v2 import V2Mission, DispatchPolicy
from mission import HOME_PHASES


class V2IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = DispatchPolicy()

    def mission(self):
        return V2Mission(self.policy, rng=random.Random(7), order_count=8)

    def finish(self, mission, budget=16000):
        seen = set()
        minimum = 1.
        for _ in range(budget):
            mission.advance(.05,{})
            seen.update(u['phase'] for u in mission.uavs)
            minimum = min(minimum, *(u['battery'] for u in mission.uavs))
            self.assertLessEqual(sum(u['phase']=='unloading' for u in mission.uavs),1)
            if any(u['phase']=='unloading' for u in mission.uavs):
                self.assertTrue(mission.at_meeting())
            if not mission.running:
                return seen, minimum
        self.fail('V2 mission stalled')

    def test_real_policy_completes_balanced_and_imbalanced_campus(self):
        for profile in ['balanced','imbalanced']:
            mission = self.mission()
            mission.control({'action':'battery_mode','value':profile})
            mission.control({'action':'start'})
            seen, minimum = self.finish(mission)
            self.assertEqual(mission.stats['deliveredOrders'],8)
            # The V2 executor now keeps one rendezvous wave open and rolls a
            # returned UAV into the next unreserved order.  The old all-home
            # barrier produced three waves for eight orders and is no longer
            # the expected efficiency behavior.
            self.assertEqual(mission.wave_number,1)
            self.assertEqual(len(mission.last_plan['assignments']),8)
            self.assertLess(len({a['uavId'] for a in mission.last_plan['assignments']}),8)
            self.assertEqual(mission.wave_stage,'complete')
            self.assertTrue(all(u['phase']=='docked' for u in mission.uavs))
            self.assertGreater(minimum,.1)
            self.assertGreater(mission.stats['uavEnergyWh'],0)
            self.assertIn('picking',seen)
            self.assertIn('unloading',seen)
            self.assertFalse(mission.dynamic_order_stream)
            self.assertEqual(mission.snapshot({})['dispatch']['version'],2)

    def test_pause_and_reset_preserve_or_clear_wave(self):
        mission = self.mission()
        mission.control({'action':'start'})
        for _ in range(120):
            mission.advance(.05,{})
        mission.control({'action':'pause'})
        before = copy.deepcopy((mission.elapsed,mission.uavs,mission.rover,mission.wave_plan,mission.stats))
        mission.advance(10,{})
        self.assertEqual(before,(mission.elapsed,mission.uavs,mission.rover,mission.wave_plan,mission.stats))
        mission.control({'action':'reset'})
        self.assertEqual(mission.wave_number,0)
        self.assertIsNone(mission.wave_plan)
        self.assertEqual(mission.stats['uavEnergyWh'],0)

    def test_midflight_dispatch_is_queued_and_preserves_assigned_orders(self):
        mission = self.mission()
        mission.control({'action':'start'})
        for _ in range(60):
            mission.advance(.05,{})
        wave = copy.deepcopy(mission.wave_plan)
        targets = [u['targetOrderId'] for u in mission.uavs]
        mission.command(dict(action_type='dispatch',target_area='B',assign_agents=['uav_1','uav_3']))
        self.assertIsNotNone(mission.queued_command)
        self.assertEqual(mission.wave_plan,wave)
        self.assertEqual([u['targetOrderId'] for u in mission.uavs],targets)
        self.finish(mission)
        self.assertIsNone(mission.queued_command)
        self.assertTrue(all(o['status']=='delivered' for o in mission.orders if o['area']=='B'))
        self.assertTrue(all(o['status']=='delivered' for o in mission.orders if o['id'] in targets))
        mission.command(dict(action_type='dispatch',assign_agents=['all']))
        self.finish(mission)
        self.assertEqual(mission.stats['deliveredOrders'],8)

    def test_partial_preflight_launches_ready_aircraft(self):
        mission = self.mission()
        mission.uavs[0]['battery']=.1
        mission.control({'action':'start'})
        for _ in range(20):
            mission.advance(.05,{})
        self.assertEqual(mission.wave_stage,'executing')
        self.assertTrue(any(u['phase'] not in HOME_PHASES for u in mission.uavs))
        self.assertTrue(any(u['phase'] in HOME_PHASES for u in mission.uavs))

    def test_dynamic_orders_reach_thirty_with_real_ids_beyond_model_slots(self):
        for profile in ['balanced','imbalanced']:
            mission = V2Mission(self.policy, rng=random.Random(7))
            mission.control({'action':'battery_mode','value':profile})
            initial = len(mission.orders)
            self.assertTrue(4 <= initial <= 8)
            mission.control({'action':'start'})
            saw_streaming = saw_late_id = False
            for tick in range(40000):
                mission.advance(.05,{})
                if tick == 100:
                    frozen = copy.deepcopy((mission.elapsed,mission.orders))
                    mission.control({'action':'pause'})
                    mission.advance(30,{})
                    self.assertEqual(frozen,(mission.elapsed,mission.orders))
                    mission.control({'action':'start'})
                saw_streaming |= len(mission.orders) > initial
                if mission.wave_plan:
                    for a in mission.wave_plan['assignments']:
                        # Rolling refills can append orders from a later
                        # 18-slot model window; the stable physical order ID
                        # is the authoritative assignment reference.
                        self.assertIn(a['orderId'],[o['id'] for o in mission.orders])
                        saw_late_id |= a['orderId'] > 18
                    for d in mission.wave_plan['traces']:
                        if d['stage']=='uav':
                            self.assertEqual(d['orderId'],mission.wave_plan['windowOrderIds'][d['action']])
                waiting = [o for o in mission.orders if not o['completed']]
                self.assertEqual(len(waiting),len({o['locationId'] for o in waiting}))
                self.assertLessEqual(len(waiting),8)
                if not mission.running:
                    break
            self.assertTrue(saw_streaming)
            self.assertTrue(saw_late_id)
            self.assertEqual(len(mission.orders),30)
            self.assertEqual(mission.stats['deliveredOrders'],30)
            self.assertEqual(mission.wave_stage,'complete')
            self.assertFalse(mission.order_stream_enabled)
            self.assertTrue(all(u['phase']=='docked' for u in mission.uavs))

    def test_dynamic_stream_keeps_twelve_second_cadence_and_area_filter(self):
        mission = V2Mission(self.policy,rng=random.Random(1),max_orders=12)
        initial = len(mission.orders)
        self.assertLess(initial,8)
        mission.control({'action':'start'})
        for _ in range(239):
            mission.advance(.05,{})
        self.assertEqual(len(mission.orders),initial)
        for _ in range(2):
            mission.advance(.05,{})
        self.assertEqual(len(mission.orders),initial+1)
        self.assertAlmostEqual(mission.orders[-1]['createdAt'],12,delta=.051)
        mission.control({'action':'reset'})
        initial = len(mission.orders)
        mission.command(dict(action_type='dispatch',target_area='B',assign_agents=['uav_1','uav_3']))
        self.finish(mission,budget=40000)
        self.assertTrue(all(o['area']=='B' for o in mission.orders[initial:]))
        self.assertEqual(len(mission.orders),12)
        mission.command(dict(action_type='dispatch',assign_agents=['all']))
        self.finish(mission,budget=40000)
        self.assertEqual(mission.stats['deliveredOrders'],12)


if __name__=='__main__':
    unittest.main()
