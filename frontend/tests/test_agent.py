import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import httpx
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from agent import DispatchAgent, AgentFailure
from mission import Mission


class AgentAdapterTests(unittest.TestCase):
    def adapter(self, handler):
        with patch.dict(os.environ, {'CAMPUS_AI_BASE_URL': 'http://127.0.0.1:8045/v1', 'CAMPUS_AI_API_KEY': 'test-only-key'}):
            agent = DispatchAgent(Path('/nonexistent-test-config'))
        agent.http.close()
        agent.http = httpx.Client(transport=httpx.MockTransport(handler))
        self.addCleanup(agent.http.close)
        return agent

    def test_discovery_chat_and_structured_execution(self):
        observed = []
        command = dict(action_type='dispatch', target_area='B', priority='urgent', energy_limit=None, assign_agents=['uav_1', 'uav_3'])
        def handler(request):
            observed.append(request.url.path)
            self.assertEqual(request.headers['authorization'], 'Bearer test-only-key')
            if request.method == 'GET':
                return httpx.Response(200, json={'data': [{'id': 'gemini-2.5-flash'}, {'id': 'another-model'}]})
            payload = json.loads(request.content)
            self.assertEqual(payload['model'], 'gemini-2.5-flash')
            self.assertEqual(payload['stream'], False)
            self.assertEqual(payload['messages'][1]['content'], '派1号和3号机去B区')
            return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(command)}}]})
        agent = self.adapter(handler)
        agent.check()
        self.assertTrue(agent.ready)
        self.assertFalse(agent.verified)
        parsed = agent.generate('派1号和3号机去B区')
        self.assertTrue(agent.verified)
        m = Mission(); m.command(parsed); m.assign()
        self.assertIsNone(m.uavs[1]['targetOrderId'])
        self.assertEqual(observed, ['/v1/models', '/v1/chat/completions'])
        self.assertNotIn('key', json.dumps(agent.health()))

    def test_offline_and_auth_error_do_not_expose_response_or_secret(self):
        for code in [401, 500]:
            agent = self.adapter(lambda _: httpx.Response(code, text='test-only-key should never be exposed'))
            agent.check()
            self.assertFalse(agent.ready)
            self.assertFalse(agent.verified)
            self.assertNotIn('test-only-key', agent.message)
            with self.assertRaises(AgentFailure): agent.generate('开始取件')
        def failed(request): raise httpx.ConnectError('test-only-key', request=request)
        agent = self.adapter(failed); agent.check()
        self.assertFalse(agent.ready)
        self.assertIn('无法连接', agent.message)
        self.assertNotIn('test-only-key', agent.message)

    def test_invalid_ai_output_cannot_execute_a_mission(self):
        def handler(request):
            if request.method == 'GET': return httpx.Response(200, json={'data': [{'id': 'gemini-2.5-flash'}]})
            return httpx.Response(200, json={'choices': [{'message': {'content': 'not-json'}}]})
        agent = self.adapter(handler); agent.check()
        m = Mission()
        with self.assertRaises(AgentFailure): m.command(agent.generate('开始取件'))
        self.assertFalse(m.running)
        self.assertEqual(m.stats['completedOrders'], 0)

    def test_model_uses_real_available_gemini_ids(self):
        agent = self.adapter(lambda _: httpx.Response(200, json={'data': [{'id': 'gemini-3.1-flash'}]}))
        agent.check()
        self.assertEqual(agent.model, 'gemini-3.1-flash')
        self.assertTrue(agent.ready)

    def test_deepseek_authenticates_and_recovers_without_false_ready(self):
        calls = []
        code = [401]
        def handler(request):
            calls.append(str(request.url))
            return httpx.Response(code[0], json={'data': [{'id': 'deepseek-flash'}]})
        agent = self.adapter(handler)
        agent.base = 'https://api.deepseek.com'
        agent.model = 'deepseek-flash'
        agent.verified = True
        agent.check()
        self.assertFalse(agent.ready)
        self.assertFalse(agent.verified)
        self.assertIn('鉴权失败', agent.health()['agentLastError'])
        code[0] = 200
        agent.check()
        self.assertTrue(agent.ready)
        self.assertFalse(agent.verified, 'model discovery alone is not a chat verification')
        self.assertIsNone(agent.last_error)
        self.assertEqual(calls, ['https://api.deepseek.com/models'] * 2)
        agent.model = 'missing-model'
        agent.check()
        self.assertFalse(agent.ready)

    def test_invalid_command_fields_are_rejected_before_verification(self):
        valid = dict(action_type='dispatch', target_area='B', priority='normal',
                     energy_limit=None, assign_agents=['uav_1'])
        invalid = [dict(valid, assign_agents=['uav_9']), dict(valid, energy_limit=True),
                   dict(valid, energy_limit=101), dict(valid, target_area='D'),
                   dict(valid, priority='anything'), dict(valid, extra='ignored'),
                   {k: v for k, v in valid.items() if k != 'target_area'}]
        for command in invalid:
            with self.subTest(command=command):
                def handler(request):
                    if request.method == 'GET':
                        return httpx.Response(200, json={'data': [{'id': 'gemini-2.5-flash'}]})
                    return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(command)}}]})
                agent = self.adapter(handler)
                with self.assertRaises(AgentFailure):
                    agent.generate('开始取件')
                self.assertFalse(agent.verified)
                self.assertTrue(agent.ready, 'bad output must not disable an authenticated API')

    def test_new_preset_invalidates_older_ai_and_old_epoch_controls(self):
        import queue
        from collections import OrderedDict
        from service import Service
        service = Service.__new__(Service)
        service.mission = Mission()
        service.model_error = None
        service.control_revision = 0
        service.commands = queue.Queue()
        service.results = OrderedDict()
        replies = []
        service.publish = lambda topic, payload, **kw: replies.append(payload)
        epoch = service.mission.epoch
        service.commands.put(('simulation/command/agent',dict(request_id='preset',action_type='dispatch',assign_agents=['all'])))
        service.handle_commands()
        self.assertTrue(replies[-1]['ok'])
        service.commands.put(('simulation/command/agent',dict(request_id='late-ai',action_type='dispatch',assign_agents=['all'],_revision=0,mission_epoch=epoch)))
        service.handle_commands()
        self.assertFalse(replies[-1]['ok'])
        service.commands.put(('simulation/control',dict(request_id='reset',action='reset')))
        service.handle_commands()
        service.commands.put(('simulation/control',dict(request_id='old-start',action='start',epoch=epoch)))
        service.handle_commands()
        self.assertFalse(replies[-1]['ok'])
        self.assertFalse(service.mission.running)

    def test_old_ai_response_cannot_restart_paused_or_reset_mission(self):
        import queue
        from collections import OrderedDict
        from service import Service
        service = Service.__new__(Service)
        service.mission = Mission()
        service.model_error = None
        service.control_revision = 1
        service.commands = queue.Queue()
        service.results = OrderedDict()
        replies = []
        service.publish = lambda topic, payload, **kw: replies.append(payload)
        for rev, epoch in [(0, service.mission.epoch), (1, 'previous-mission')]:
            service.commands.put(('simulation/command/agent', dict(request_id=f'test-{rev}-{epoch}', action_type='dispatch',
                assign_agents=['all'], _revision=rev, mission_epoch=epoch)))
            service.handle_commands()
            self.assertFalse(replies[-1]['ok'])
            self.assertFalse(service.mission.running)


if __name__ == '__main__': unittest.main()
