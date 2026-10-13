# 新算法仓库审查与展示设计

> 实施状态更新：用户确认方案后，现已实现并运行本机 MQTT / Python ONNX / 权威任务模拟器与任务演示台。下文第1–4节保留的是实施前审查记录，其中“尚未接通”等表述对应当时状态。当前契约、启动方法、真实限制请见 [backend-integration.md](backend-integration.md)，实测验收见 [campus-acceptance.md](campus-acceptance.md)。未改动上游仓库。

审查日期：2026-10-13（Asia/Shanghai）。上游仓库：<https://github.com/chenyuancqu/transform>。

已通过 `git ls-remote` 核对 `main` 最新提交为 `8849daf9c3c2d74eec42796461fc9feb6aeefb26`，提交时间 2026-10-13 13:32:19 +08:00，主题为迁移到 MEC、MQTT 与 Gemini Agent。上游以稀疏只读检查副本放在工作区 `_algorithm-review/transform-upstream`；本轮没有修改上游、没有启动它的服务，也没有将现有场景假称为已接入 MQTT。

## 1. 实际已经有什么

| 能力 | 上游当前实现 | 前端如何展示 |
| --- | --- | --- |
| 多智能体策略 | `main.py` 为 MADDPG；母车 6 维观测/2 维动作，3 架 UAV 各 10 维观测/3 维动作 | 展示母车与三架 UAV 的任务关系，算法细节放联调页 |
| 模型导出 | `export_onnx.py` 从最佳 checkpoint 导出四个 ONNX | 接入后端模型，不在浏览器推理 |
| 后端推理 | `backend.py` 通过 TCP MQTT 接收 `{id,state}`，调用 ONNX Runtime，再发布 `simulation/action/{id}` | 展示动作消息和后端连接状态 |
| 通信冒烟测试 | `simulator_client.py` 每秒随机挑一个智能体，发随机 6/10 维向量；只打印收到的动作 | 只能验证消息与推理链路，不能驱动可信园区轨迹 |
| 自然语言解析 | `agent_server.py` 读取终端输入，调用 Gemini，发布结构化 JSON 到 `simulation/command/agent` | AI 方案卡片；解析与执行必须分开显示 |
| 训练评估 | `main.py` 支持训练、无噪声评估、保存最佳权重、生成收敛曲线 | 如需要算法答辩，可展示真实训练曲线；不能当在线运营数据 |

四个模型与当前项目 `public/models/` 的 Git blob hash 完全相同：

| 模型 | 上游与当前项目相同的 hash |
| --- | --- |
| rover.onnx | `79be85cbe3b79ce764a8bfcb32fe477ae05b2495` |
| uav_1.onnx | `20859ebb80b9a17c7ac0f11451e6360620b3a094` |
| uav_2.onnx | `e01f80a50264e6add00086411f0cc832ae35c3c8` |
| uav_3.onnx | `a0c14e7538101055f92da7c7490d87d8de5c9ef1` |

所以本次主要升级的是计算部署与通信架构，并不是四个模型权重发生了改变。

## 2. 文档与仓库之间的缺口

1. **可视遥测尚未发布。** 文档规定 `position/battery/status/target`，但当前模拟器仅发送 `{id,state}`。它的 `state` 是随机观测向量，不能取前几个数当真实位置。真实环境中的位置为 0–1 归一化坐标；无人机电量为 0–1，和文档的米制位置/0–100 电量不是同一接口。
2. **前端聊天入口尚未实现。** Agent 只有 CLI 输入，没有 HTTP 服务，也没有 MQTT 输入订阅。用户已同意新输入主题采用 `simulation/command/input`，输出保留 `simulation/command/agent`。
3. **结构化指令尚未执行。** 后端有指令处理分支，但连接时只订阅 `simulation/state/#`，没订阅 `simulation/command/agent`。该分支当前也只打印字段，未替换目标、安排优先级或执行急停。
4. **动作尚未形成模拟器闭环。** 模拟器收到动作后只打印，未更新环境位置、推进订单、发布任务事件。仓库的训练环境 `step()` 存在，但当前 MQTT 模拟器未接入它。
5. **运营指标尚未发布。** 在线取件数、任务时延、实际平均能耗和 MEC 动态卸载状态没有遥测主题。后端固定运行 ONNX，不等于已实现云边动态卸载。
6. **精确取件尚未迁移。** 上游 `main.py` 的训练环境仍使用归一化 `min_dist < 0.08` 完成判定；先前 R3F 的 35cm/20cm、稳定悬停和吊具流程尚不在上游。新架构中，任务判定与取件时序必须迁移到后端模拟器；前端只播放状态和进度。

本机检查：只有 `127.0.0.1:3000` 前端在监听；没有发现 1883、8083 或 8000 服务。本轮不宣称上游服务已经成功运行或已经完成新架构联调。

## 3. 推荐展示：任务演示台

延续现有白天园区和真实建筑资产，不再围绕与无人协同无关的示意能源柱图组织大屏。

- **中间：园区态势。** 默认斜俯视，保留自由镜头；园区占主体，车辆、无人机、包裹和任务路线保持真实尺度。未选择任务时克制显示标签；选择任务后才突出相关设备、目标区域和路径。
- **左侧：任务与设备。** 展示母车、UAV 1–3 的真实状态、电量、当前目标和任务归属；点击设备或订单联动镜头。断开时写“未连接”，超时写“遥测过期”。
- **右侧：AI 调度助手。** 用户输入自然语言，生成易读方案卡片：区域、设备、优先级、能耗上限。状态严格区分“输入已发送”“解析结果已收到”“执行已确认”“执行中”“已完成/失败”。缺少执行回执时只能写“等待确认”。
- **底部：任务进度。** 显示“任务提出 → 调度解析 → 动作执行 → 取件回收”的当前阶段。完成量、能耗与时延只用后端真实数据；未提供则显示“—”。

自然语言示例沿用仓库支持的字段：普通协同取件、B 区指定 1/3 号机加急、能耗上限 75%。这些是展示场景设计，不代表上游已实现区域派单或能耗限制的执行。

额外提供“算法联调台”，用于研发时看模型观测维度、动作、消息时间和数据有效性。面向评委的主展示不常驻原始 JSON、Topic 名称和大量无关图表。

本轮界面草图可切换两种布局、三个场景；采用当前园区实际渲染截图作背景，明确标注“展示设计预览 · 非实时数据”。它是可交互设计预览，不是已改造的生产页面。

设计预览已在浏览器检查：两个场景背景图片均加载成功；切换节能调度后方案显示 75% 能耗上限；方案示例按钮会更新说明；两种布局切换成功。1024px 和 320px 视口均截图查看，320px 根容器 clientWidth/scrollWidth 均为 288px，无横向溢出；浏览器无错误。截图为 `output/playwright/task-console-design-1024.png`、`algorithm-console-design-1024.png`、`task-console-design-320.png`。

## 4. 后续实施顺序

1. 在真正的模拟器中消费后端动作并更新环境；让模拟器承担精确取件与回收规则。算法内部保留仓库归一化单位，后端明确转换后发布米制可视遥测，不自动猜测单位。
2. 发布带坐标、电量、任务状态和时间戳的可视遥测；神经网络 `state` 与可视字段明确区分。发布权威任务列表/事件及完成计数；涉及新主题的字段另写契约，不假称当前仓库已经支持。
3. 接入 MQTT over WebSocket 前端客户端。使用实际遥测插值驱动模型，不用动作数组自行累加位置，也不在浏览器继续运行 ONNX、任务分配或完成判定。
4. Agent 订阅用户确认的 `simulation/command/input`，请求中携带 `request_id`；后端订阅解析输出并产生执行回执，便于界面识别自身请求、异常和真正的执行结果。
5. 在真实 Broker、后端、模拟器、Agent 上联调，验证过期遥测、重连、乱序消息、重复指令、急停、任务完成和动画同步；现场演示提前准备明确标注的遥测回放，不能在掉线时悄悄用假数据顶替实时数据。

来源文件：[backend.py](https://github.com/chenyuancqu/transform/blob/8849daf9c3c2d74eec42796461fc9feb6aeefb26/backend.py)、[simulator_client.py](https://github.com/chenyuancqu/transform/blob/8849daf9c3c2d74eec42796461fc9feb6aeefb26/simulator_client.py)、[agent_server.py](https://github.com/chenyuancqu/transform/blob/8849daf9c3c2d74eec42796461fc9feb6aeefb26/agent_server.py)、[main.py](https://github.com/chenyuancqu/transform/blob/8849daf9c3c2d74eec42796461fc9feb6aeefb26/main.py)。
