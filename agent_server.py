
# -*- coding: utf-8 -*-
import os
import sys
import json
import time
from pathlib import Path
import paho.mqtt.client as mqtt

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / 'frontend'
BACKEND_DIR = FRONTEND_DIR / 'backend'

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from agent import DispatchAgent
    ai_agent = DispatchAgent(FRONTEND_DIR)
    ai_agent.check()
    has_dispatch_agent = True
except Exception as e:
    ai_agent = None
    has_dispatch_agent = False
    print(f'[警告] 加载 DispatchAgent 异常: {e}')

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print('[Agent Server] MQTT 连接成功，准备派发指令...')
    else:
        print(f'[Agent Server] MQTT 连接失败，返回码: {rc}')

mqtt_client.on_connect = on_connect
try:
    mqtt_client.connect('localhost', 1883, keepalive=60)
    mqtt_client.loop_start()
except Exception as e:
    print(f'[MQTT 连接提示] localhost:1883 尚未就绪，如需联调请先启动 MQTT Broker: {e}')

def parse_command_with_agent(user_prompt):
    if has_dispatch_agent and ai_agent and ai_agent.ready:
        try:
            return ai_agent.generate(user_prompt)
        except Exception as e:
            print(f'[AI Agent 解析错误] {e}')
            return None
    else:
        print('[错误] AI Agent 未就绪，请检查 frontend/.env 中的 DeepSeek 配置')
        return None

def main():
    print('=' * 60)
    provider_name = 'DeepSeek' if (ai_agent and 'deepseek' in (ai_agent.model or '').lower()) else 'AI Agent'
    print(f' [AI Agent] 空地协同系统调度 Agent 已启动 (基于 {provider_name} API)')
    print(' 提示：直接在下方输入自然语言指令（例如：派 1 号和 2 号无人机去 C 区加急取货）')
    print(' 输入 exit 退出程序。')
    print('=' * 60)

    while True:
        try:
            user_input = input(chr(10) + '请输入调度指令: ').strip()
            if user_input.lower() == 'exit':
                print('退出 Agent 服务...')
                break

            if not user_input:
                continue

            print(f'[正在思考] {provider_name} 正在解析您的意图...')
            command_json = parse_command_with_agent(user_input)

            if command_json:
                print('[Agent 解析成功] 结构化控制参数：')
                print(json.dumps(command_json, indent=4, ensure_ascii=False))

                topic = 'simulation/command/agent'
                payload = json.dumps(command_json)
                try:
                    mqtt_client.publish(topic, payload)
                    print(f'[MQTT] 已将结构化指令广播至主题: {topic}')
                except Exception as ex:
                    print(f'[MQTT 发送异常] {ex}')
            else:
                print('[解析失败] 未能成功生成结构化指令，请重试。')

        except KeyboardInterrupt:
            break

if __name__ == '__main__':
    try:
        main()
    finally:
        try:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        except Exception:
            pass
        print('[Agent Server] 已退出')
