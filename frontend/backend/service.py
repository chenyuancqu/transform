"""Local MEC service: real ONNX actors + authoritative simulator + optional AI gateway.

Upstream baseline: chenyuancqu/transform@8849daf9. This service completes the
missing environment/control bridge; no neural inference runs in the browser.
"""
import json
import os
from pathlib import Path
import queue
import signal
import threading
import time
from collections import OrderedDict

import numpy as np
import onnxruntime as ort
import paho.mqtt.client as mqtt

from mission import Mission
from agent import DispatchAgent, AgentFailure

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ['mother', 'uav_1', 'uav_2', 'uav_3']


class Policy:
    def __init__(self):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.sessions = {name: ort.InferenceSession(str(ROOT / 'public' / 'models' / f"{'rover' if name == 'mother' else name}.onnx"),
                                                  sess_options=options, providers=['CPUExecutionProvider']) for name in AGENTS}
        self.latency = None
        self.count = 0

    def infer(self, observations):
        started = time.perf_counter()
        actions = {}
        for name, session in self.sessions.items():
            values = np.asarray([observations[name]], dtype=np.float32)
            result = session.run(None, {session.get_inputs()[0].name: values})[0].reshape(-1)
            if len(result) != (2 if name == 'mother' else 3) or not np.isfinite(result).all():
                raise ValueError(f'Invalid model output: {name}')
            actions[name] = np.clip(result, -1, 1).tolist()
        self.latency = (time.perf_counter() - started) * 1000
        self.count += 1
        return actions


class Service:
    def __init__(self):
        self.policy = Policy()
        self.mission = Mission()
        self.commands = queue.Queue(maxsize=256)
        self.chat = queue.Queue(maxsize=32)
        self.results = OrderedDict()
        self.stop = threading.Event()
        self.connected = False
        self.model_error = None
        self.control_revision = 0
        self.agent = DispatchAgent(ROOT)
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='campus_mec_backend', clean_session=True)
        self.client.reconnect_delay_set(min_delay=1, max_delay=3)
        self.client.will_set('simulation/backend/status', json.dumps({'online': False}), qos=1, retain=True)
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message

    def publish(self, topic, data, retain=False):
        self.client.publish(topic, json.dumps(data, ensure_ascii=False, allow_nan=False), qos=1, retain=retain)

    def publish_backend_status(self):
        # An old connection's retained will can arrive after a replacement connects.
        # A live service periodically restores its own status; telemetry expiry and
        # the offline will continue to freeze the frontend when the service stops.
        self.publish('simulation/backend/status', dict(self.health(),
                     timestamp=time.time() * 1000, epoch=self.mission.epoch), True)

    def on_connect(self, client, userdata, flags, reason, properties):
        if reason.is_failure:
            return
        self.connected = True
        client.subscribe([('simulation/control', 1), ('simulation/command/agent', 1), ('simulation/command/input', 1)])
        self.publish_backend_status()
        print('MEC connected: 4 ONNX models loaded; AI configured:', self.agent.configured, flush=True)

    def on_disconnect(self, client, userdata, flags, reason, properties):
        self.connected = False
        # Mission mutations stay on the simulation thread.

    def on_message(self, client, userdata, message):
        if message.retain:
            return  # Old retained controls must never replay after a reconnect.
        try:
            if len(message.payload) > 8192:
                raise ValueError('指令过长')
            data = json.loads(message.payload)
            if not isinstance(data, dict):
                raise ValueError('指令需要 JSON 对象')
            if message.topic == 'simulation/command/input':
                data['_revision'] = self.control_revision
                data['mission_epoch'] = data.get('epoch', self.mission.epoch)
                self.chat.put_nowait(data)
            else:
                self.commands.put_nowait((message.topic, data))
        except (ValueError, queue.Full) as error:
            self.publish('simulation/command/result', {'ok': False, 'message': str(error), 'request_id': None})

    def reply(self, request_id, ok, message, **extra):
        result = dict(request_id=request_id, ok=ok, message=message, timestamp=time.time() * 1000, **extra)
        if request_id:
            self.results[request_id] = result
            while len(self.results) > 256:
                self.results.popitem(last=False)
        self.publish('simulation/command/result', result)

    def handle_commands(self):
        while not self.commands.empty():
            topic, data = self.commands.get_nowait()
            request_id = data.get('request_id')
            if request_id is not None and (not isinstance(request_id, str) or len(request_id) > 128):
                self.reply(None, False, 'request_id 无效')
                continue
            if request_id in self.results:
                self.publish('simulation/command/result', self.results[request_id])
                continue
            try:
                if topic == 'simulation/command/agent' and ('_revision' in data or 'mission_epoch' in data):
                    if data.get('_revision') != self.control_revision or data.get('mission_epoch') != self.mission.epoch:
                        raise ValueError('任务已暂停、停止或重置，旧 AI 结果已作废，指令未执行')
                if self.model_error and (data.get('action') == 'start' or data.get('action_type') != 'emergency_stop' and topic.endswith('/agent')):
                    raise ValueError('推理异常，请重启后端并检查模型')
                text = self.mission.control(data) if topic == 'simulation/control' else self.mission.command(data)
                if data.get('action') in ['pause', 'reset'] or data.get('action_type') == 'emergency_stop':
                    self.control_revision += 1
                self.reply(request_id, True, text, command=data, epoch=self.mission.epoch)
            except (ValueError, TypeError, KeyError) as error:
                self.reply(request_id, False, str(error))

    def agent_worker(self):
        seen = set()
        while not self.stop.is_set():
            if self.agent.configured and time.monotonic() - self.agent.last_check >= (30 if self.agent.ready else 5):
                self.agent.check()
            try:
                request = self.chat.get(timeout=.5)
            except queue.Empty:
                continue
            request_id = request.get('request_id')
            if not isinstance(request_id, str) or not request_id or len(request_id) > 128:
                self.publish('simulation/agent/status', {'request_id': None, 'status': 'error', 'message': '聊天需要有效 request_id'})
                continue
            if request_id in seen:
                continue
            seen.add(request_id)
            if len(seen) > 256:
                seen = {request_id}
            text = request.get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                self.publish('simulation/agent/status', dict(request_id=request_id, status='error', message='请输入1–1000字的调度需求'))
                continue
            if not self.agent.configured:
                self.publish('simulation/agent/status', dict(request_id=request_id, status='error', message='后端未配置 AI 接口；可使用预设调度'))
                continue
            self.publish('simulation/agent/status', dict(request_id=request_id, status='parsing', message='AI 正在解析调度需求'))
            try:
                command = self.agent.generate(text)
                command['request_id'] = request_id
                command['source'] = self.agent.health()['agentProvider']
                command['_revision'] = request['_revision']
                command['mission_epoch'] = request['mission_epoch']
                self.publish('simulation/command/agent', command)
            except AgentFailure as error:
                self.publish('simulation/agent/status', dict(request_id=request_id, status='error', message=str(error)))
            except Exception:
                # Never send SDK exception text (which may contain request details/secrets) to the browser.
                self.publish('simulation/agent/status', dict(request_id=request_id, status='error', message='AI 解析失败，请检查后端服务配置或使用预设调度'))

    def health(self):
        return dict(online=self.connected, modelsLoaded=4, inferenceCount=self.policy.count,
                    inferenceMs=self.policy.latency, **self.agent.health(),
                    inferenceLocation='local_mec', error=self.model_error)

    def run(self):
        self.client.connect('127.0.0.1', 1883, 30)
        self.client.loop_start()
        threading.Thread(target=self.agent_worker, daemon=True).start()
        actions = {name: [0] * (2 if name == 'mother' else 3) for name in AGENTS}
        previous = time.monotonic()
        last_inference = last_publish = last_status = 0
        action_epoch = None
        try:
            while not self.stop.wait(.05):
                now = time.monotonic()
                dt = min(.1, now - previous)
                previous = now
                if not self.connected:
                    self.mission.running = False
                    continue
                self.handle_commands()
                if now - last_status >= 1:
                    self.publish_backend_status()
                    last_status = now
                if self.mission.running and (now - last_inference >= .5 or action_epoch != self.mission.epoch):
                    self.mission.assign()
                    try:
                        actions = self.policy.infer(self.mission.observations())
                        action_epoch = self.mission.epoch
                        for name, action in actions.items():
                            self.publish(f'simulation/action/{name}', [action])
                    except Exception as error:
                        self.model_error = type(error).__name__
                        self.mission.running = False
                        self.mission.event('模型推理失败 · 任务已暂停')
                    last_inference = now
                self.mission.advance(dt * self.mission.speed, actions)
                if now - last_publish >= .1:
                    snap = self.mission.snapshot(self.health())
                    self.publish('simulation/snapshot', snap, True)
                    observations = self.mission.observations()
                    for index, name in enumerate(AGENTS):
                        agent = snap['rover'] if name == 'mother' else snap['uavs'][index - 1]
                        target = next((o['position'][:2] for o in snap['orders'] if o['id'] == agent.get('targetOrderId')), None)
                        status = 'idle' if name == 'mother' else ('delivering' if agent['phase'] in ['picking', 'unloading'] else 'charging' if agent['phase'] == 'charging' else 'idle' if agent['phase'] in ['idle', 'docked'] else 'flying')
                        self.publish(f'simulation/state/{name}', dict(id=name, status=status, position=agent['position'],
                                     battery=agent.get('battery', 1) * 100, target=target, state=observations[name],
                                     phase=agent.get('phase', 'moving' if self.mission.running else 'idle'),
                                     epoch=snap['epoch'], seq=snap['seq'], coordinate_system=snap['coordinate_system']))
                    last_publish = now
        finally:
            self.publish('simulation/backend/status', {'online': False}, True)
            self.client.disconnect()
            self.client.loop_stop()


if __name__ == '__main__':
    service = Service()
    signal.signal(signal.SIGINT, lambda *_: service.stop.set())
    print('Starting local MEC simulator', flush=True)
    service.run()
