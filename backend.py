import json
from pathlib import Path

import onnxruntime as ort
import paho.mqtt.client as mqtt
import numpy as np


# ============================================================
# 1. 加载 ONNX 模型
# ============================================================

# 获取当前 backend.py 所在目录，不依赖 PyCharm 的工作目录
BASE_DIR = Path(__file__).resolve().parent
ONNX_DIR = BASE_DIR / "onnx_models"

# 检查模型文件是否存在，避免启动时报不明确的文件错误
model_paths = {
    "rover": ONNX_DIR / "rover.onnx",
    "uav_1": ONNX_DIR / "uav_1.onnx",
    "uav_2": ONNX_DIR / "uav_2.onnx",
    "uav_3": ONNX_DIR / "uav_3.onnx",
}

for model_name, model_path in model_paths.items():
    if not model_path.is_file():
        raise FileNotFoundError(
            f"找不到 ONNX 模型文件：{model_path}\n"
            f"请确认 {model_name} 模型已导出到 onnx_models 目录。"
        )

# 加载母车模型
mother_session = ort.InferenceSession(
    str(model_paths["rover"])
)

# 加载 3 个无人机模型
uav_sessions = [
    ort.InferenceSession(str(model_paths["uav_1"])),
    ort.InferenceSession(str(model_paths["uav_2"])),
    ort.InferenceSession(str(model_paths["uav_3"])),
]

print(f"[初始化] ONNX 模型加载成功：{ONNX_DIR}")


# ============================================================
# 2. MQTT 消息回调
# ============================================================

def on_connect(client, userdata, flags, rc):
    """MQTT 连接成功后订阅状态主题。"""
    if rc == 0:
        print("[MQTT] 连接成功")
        client.subscribe("simulation/state/#")
        print("[MQTT] 已订阅 simulation/state/#")
    else:
        print(f"[MQTT] 连接失败，返回码：{rc}")


def on_message(client, userdata, msg):
    # 【新增】：接收并处理来自 Gemini Agent 的宏观调度指令
    if msg.topic == "simulation/command/agent":
        try:
            cmd_data = json.loads(msg.payload.decode("utf-8"))
            print("\n" + "=" * 50)
            print("🤖 [后端 MEC 收到 Agent 调度官指令]")
            print(f"  - 动作类型 : {cmd_data.get('action_type')}")
            print(f"  - 目标区域 : {cmd_data.get('target_area')}")
            print(f"  - 优先级   : {cmd_data.get('priority')}")
            print(f"  - 指派智能体: {cmd_data.get('assign_agents')}")
            print(f"  - 能耗上限   : {cmd_data.get('energy_limit')}%")
            print("=" * 50 + "\n")

            # 【扩展点】：你可以在这里定义一个全局变量，
            # 比如 global CURRENT_MISSION; CURRENT_MISSION = cmd_data
            # 这样后面的 ONNX 推理或奖励函数就可以根据这个动态调整了！

        except Exception as e:
            print(f"[Agent 指令处理异常] {e}")
        return

    """接收智能体状态，执行 ONNX 推理并发布动作。"""
    try:
        # 解析状态数据
        data = json.loads(msg.payload.decode("utf-8"))
        agent_id = data["id"]
        state = np.asarray(data["state"], dtype=np.float32)

        # 修复：ONNX 模型要求输入为 2 维（带有 Batch 维度），如果收到 1 维则自动升维
        if state.ndim == 1:
            state = np.expand_dims(state, axis=0)  # 例如 [8] -> [1, 8]

        # 根据智能体 ID 匹配对应的 ONNX 会话
        if agent_id == "mother":
            session = mother_session
        elif agent_id.startswith("uav_"):
            uav_idx = int(agent_id.split("_")[-1]) - 1

            if not 0 <= uav_idx < len(uav_sessions):
                print(f"[推理失败] 未知的无人机 ID：{agent_id}")
                return

            session = uav_sessions[uav_idx]
        else:
            print(f"[推理失败] 未知的智能体 ID：{agent_id}")
            return

        # 获取模型输入名称
        input_name = session.get_inputs()[0].name

        # 执行推理
        action = session.run(
            None,
            {input_name: state}
        )[0]

        # 发布推理结果
        action_data = json.dumps(action.tolist())
        result = client.publish(
            f"simulation/action/{agent_id}",
            action_data
        )

        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            print(f"[推理成功] {agent_id} -> {action_data}")
        else:
            print(
                f"[消息发送失败] {agent_id}，"
                f"MQTT 返回码：{result.rc}"
            )

    except (json.JSONDecodeError, KeyError, ValueError, IndexError) as exc:
        print(f"[消息解析失败] topic={msg.topic}, error={exc}")
    except Exception as exc:
        print(f"[推理异常] topic={msg.topic}, error={exc}")


# ============================================================
# 3. 启动 MQTT 客户端
# ============================================================

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        print("[MQTT] 正在连接 localhost:1883 ...")
        client.connect("localhost", 1883, keepalive=60)

        # 持续处理 MQTT 网络事件和消息
        client.loop_forever()

    except KeyboardInterrupt:
        print("\n[程序退出] 收到中断信号")
    except Exception as exc:
        print(f"[启动失败] MQTT 连接或运行异常：{exc}")
    finally:
        client.disconnect()
        print("[MQTT] 已断开连接")


if __name__ == "__main__":
    main()