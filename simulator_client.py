import paho.mqtt.client as mqtt
import json
import time
import random

# 兼容 paho-mqtt v2 的初始化
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)


def on_connect(client, userdata, flags, rc):
    print("[模拟器] 已连接到 MQTT 经纪人，开始向后端发送状态...")
    client.subscribe("simulation/action/#")


def on_message(client, userdata, msg):
    print(f"收到后端算力决策返回 -> 话题: {msg.topic}, 动作内容: {msg.payload.decode()}")


client.on_connect = on_connect
client.on_message = on_message

client.connect("localhost", 1883)
client.loop_start()

try:
    agent_ids = ["mother", "uav_1", "uav_2", "uav_3"]

    while True:
        agent_id = random.choice(agent_ids)

        # 根据模型实际要求的维度生成对应的模拟状态数据
        if agent_id == "mother":
            state_dim = 6  # 母车模型期望 6 维
        else:
            state_dim = 10  # 无人机模型期望 10 维

        fake_state = [random.uniform(-1.0, 1.0) for _ in range(state_dim)]

        payload = {
            "id": agent_id,
            "state": fake_state
        }

        topic = f"simulation/state/{agent_id}"
        client.publish(topic, json.dumps(payload))

        print(f"已发送 -> 智能体: {agent_id}, 状态数据维度: {len(fake_state)}")
        time.sleep(1.0)

except KeyboardInterrupt:
    print("模拟器停止运行")
    client.loop_stop()
    client.disconnect()