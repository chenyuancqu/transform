import os

os.environ["http_proxy"] = "http://127.0.0.1:7897"
os.environ["https_proxy"] = "http://127.0.0.1:7897"

import json
import time
import paho.mqtt.client as mqtt
from google import genai
from google.genai import types

# ============================================================
# 1. 初始化 Gemini 客户端
# ============================================================
# 自动读取系统环境变量中的 GEMINI_API_KEY，无需手动填入 Key
client_llm = genai.Client()

# ============================================================
# 2. 初始化 MQTT 客户端
# ============================================================
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[Agent Server] MQTT 连接成功，准备派发指令...")
    else:
        print(f"[Agent Server] MQTT 连接失败，返回码: {rc}")


mqtt_client.on_connect = on_connect
mqtt_client.connect("localhost", 1883, keepalive=60)
mqtt_client.loop_start()


# ============================================================
# 3. 定义 Agent 自然语言解析核心逻辑（使用 Gemini）
# ============================================================
def parse_command_with_agent(user_prompt):
    """
    利用 Gemini 将自然语言翻译成数字孪生系统能看懂的结构化 JSON 指令
    """
    system_instruction = """
    你是一个无人仓储空地协同系统的 AI 调度总管（Supervisor Agent）。
    请将用户的自然语言调度指令解析为标准的 JSON 格式，必须包含以下字段：
    - "action_type": 动作类型（如 "dispatch" 调度, "emergency_stop" 紧急停止, "optimize_energy" 优化能耗）
    - "target_area": 目标区域（如 "A", "B", "C" 或 null）
    - "priority": 优先级（"normal", "urgent"）
    - "energy_limit": 能耗上限百分比（数值，如 70，若未提及则填 null）
    - "assign_agents": 指定执行的智能体编号（如 ["uav_1", "uav_2"] 或 ["all"]）
    """

    try:
        # 调用 Gemini 2.5 Flash 生成结构化 JSON 响应
        response = client_llm.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",  # 强约束输出纯 JSON
                temperature=0.1
            )
        )
        result_json = json.loads(response.text)
        return result_json
    except Exception as e:
        print(f"[Gemini 解析错误] {e}")
        return None


# ============================================================
# 4. 交互式主循环 (CLI 终端对话)
# ============================================================
def main():
    print("=" * 60)
    print(" 🤖 空地协同系统 AI 调度 Agent 已启动 (基于 Gemini API)")
    print(" 提示：直接在下方输入自然语言指令（例如：'派 1 号和 2 号无人机去 C 区加急取货'）")
    print(" 输入 'exit' 退出程序。")
    print("=" * 60)

    while True:
        try:
            user_input = input("\n请输入调度指令: ").strip()
            if user_input.lower() == 'exit':
                print("退出 Agent 服务...")
                break

            if not user_input:
                continue

            print(f"[正在思考] Gemini 正在解析您的意图...")
            command_json = parse_command_with_agent(user_input)

            if command_json:
                print(f"[Agent 解析成功] 结构化控制参数：")
                print(json.dumps(command_json, indent=4, ensure_ascii=False))

                # 通过 MQTT 管道广播给后端
                topic = "simulation/command/agent"
                payload = json.dumps(command_json)
                mqtt_client.publish(topic, payload)
                print(f"[MQTT] 已将结构化指令广播至主题: {topic}")
            else:
                print("[解析失败] 未能成功生成结构化指令，请重试。")

        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    try:
        main()
    finally:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        print("[Agent Server] 已安全断开连接")