# V2 PPO 调度模型接入与验收

分支：`frontend-showcase-20261014V2`。默认保留每 12 仿真秒补单、每轮最多 30 单的动态业务。

当前 `/`、`/r3f.html` 默认使用新训练的 V2 PPO 策略，后端不再调用原四个 Actor 决定巡航方向。
新策略每波依次选择母车接应点及 UAV 1/2/3 的订单；飞行、稳定悬停、吊具、单舱卸货、归位仍由后端执行。

## 启动

```powershell
cd frontend
npm ci
# 首次运行时按 README 配置 Python，或使用已安装下列模块的现有 Python：
# numpy / onnxruntime / paho-mqtt / httpx
npm run demo
```

打开 `http://127.0.0.1:3000/r3f.html`。默认速度 1.5 倍，可调整 0.3–2 倍。
`npm run demo:stop` 只停止项目记录的进程。

启动脚本优先选择 `.venv/Scripts/python.exe`，不存在时选择 PATH 中的 Python，并先检查运行模块。
如需显式选择 Python，可执行 `powershell -File scripts/start-demo.ps1 -PythonExe <python绝对路径>`。
启动时不会读取或显示 AI Key；自然语言调度仍使用已有后端配置。
没有配置或验证 AI 时，开始任务及预设调度照常使用真实 PPO 模型。

如果本机已有 TCP MQTT Broker 占用 1883，保留原服务，并在缺少 8083 时启动本机 WebSocket 桥接。
启动健康检查直接通过浏览器所使用的 WebSocket 通道验证最新快照，避免 TCP 就绪但网页无法连接。

## 模型与推理

- 源模型：`experiments/dispatch_v2/results/dispatch_policy.pt`，是离线实验验证集选出的 seed 7 检查点。
- 运行模型：`backend/models/dispatch_v2.onnx`，元数据和来源 SHA256 在同名 JSON 中。
- 导出脚本：`python experiments/dispatch_v2/export_runtime.py`，在仓库根目录执行，需要训练/导出环境的 PyTorch 与 ONNX。
- ONNX 与 PyTorch 的 32 次母车/选单决策逐项一致，有效动作分数最大误差约 `9.54e-6`。
- 日常演示仅需 ONNX Runtime，无需安装 PyTorch。
- 输入仍为全订单集合 `18×8`、全局向量 `36`、候选动作 `18×16` 和动作掩码 `18`。
- 输出为离散候选的对数概率和价值估计，不是原先的 `dx/dy/dz`。
- `health.policyVersion=2`、`modelsLoaded=1`；`snapshot.dispatch` 携带波次、阶段、接应点、选单、候选评分。
- 旧 `simulation/state/*` 主题仅保留兼容状态信息；V2 面板不把旧 6/10 维向量当作新策略输入。

## 园区适配范围

使用 8 个校准的阳台/中庭取件点；开局随机 4–8 单，每 12 仿真秒尝试补入一单，每轮最多 30 单。点位仍占用时每 3 秒重试，取件后释放点位；暂停/急停冻结补单。
模型训练场景为静态 9–18 单，动态园区是迁移适配。每次将当前待取订单映射进 18 个模型槽位，输出再映射回真实订单 ID；已完成历史订单不占槽位，因此整轮可超过 18 单。当前同时未取订单受 8 个点位约束；不能直接宣称离线改善比例在动态园区复现。
运行指标完全按当前实际执行计算。取件进近、车顶停靠、队列等开销与解析训练环境不同。

母车在中央 3×3 接应点之间按曼哈顿折线路径移动，先等本波设备补能、起飞清空，再驶往策略指定点。
不足能量的设备先在静止母车上补能，波次内无人机保持订单归属；只有本波全部回收归位且舱门关闭后才规划下一波，新到订单进入下一次规划。暂时没有待取订单但订单流尚未结束时，继续等待到单，不提前结束本轮。
回收卸货须等待母车真正到达接应点，不能在途中提前完成。

电池容量按 45Wh 换算，耗电由水平位移、垂直位移和悬停时间估计，实际消耗累计为 `uavEnergyWh`。
平均单能耗为累计消耗除以已回收订单数，包含离舱归位等开销。系数未经实机标定。
派单前有保留能量与额外精确操作余量检查，遇到异常低电量则暂停保护。

区域、设备和预算指令在当前波次回收后生效，不中途删除预约或丢失已取货物。
紧急停止和暂停立即冻结当前任务；继续任务恢复当前波次。
新预设会使更早发起的 AI 结果失效；过期任务轮次的指令会被拒绝。
前端重置/电量模式回执若先于新轮次快照到达，会保留忙碌状态直到新轮次就绪。

`CAMPUS_POLICY=legacy` 可在启动服务前选择旧版四模型路径，旧集成测试为 `npm run test:integration:legacy`。
这不是前端运行中的切换按钮；切换模式需要停止并重新启动后端。

## 前端展示

- 标题及任务卡显示 V2 PPO、当前波次与波次状态。
- 地图绘制接应点标记和母车折线路径；无人机返航引导指向本波接应点。
- 任务卡显示模型分配的 `UAV → 订单`，支持开始、暂停、重置与初始电量模式。
- 联调面板展示真实候选评分、推理数量/耗时、模型输入形状及累计 Wh 能耗。
- 重置后不会复用脱离场景的设备对象；已修复母车标签停留原点的问题。
- 后端断开后冻结状态并禁用控制，恢复连接后接收新的任务快照。

## 验收

```powershell
npm run build
npm run test:backend
node --test tests/telemetry.test.js tests/device-motion.test.js tests/district-roads.test.mjs
npm run test:integration
node tests/backend-health-heartbeat.mjs
```

新增后端回归覆盖真实 V2 模型的均衡/不均衡电量整轮执行、动态三十单、订单 ID 超过十八的映射、暂停和重置、区域指令延迟生效、
预起飞补能、单舱互斥、母车到位才能卸货；指令层额外覆盖旧 AI 及旧轮次控制的拒绝。
前端回归覆盖离散调度字段验证、无效候选与重复预约拒绝、重挂载后设备标签定位。

`npm run test:integration` 会通过真实 WebSocket 通道操作本机演示：重置、开始、重复请求、暂停、急停、继续、
运行中补单与完整三十单回收、Wh 指标、重置及旧轮次拒绝。会重置当前演示任务，结束后停在新任务待命状态。
结果保存在 `output/v2-integration/mqtt-acceptance.json`。

此前固定八单接入阶段已观察到整轮回收；恢复动态业务后的验收以最新 `mqtt-acceptance.json` 及动态截图为准。暂停时间/位置冻结、恢复、重置与断线禁用也有独立验收。
动态运行截图见 `output/v2-integration/dynamic-live.jpg`，30 单整轮完成统计见 `mqtt-acceptance.json`。旧 `paused-policy.jpg`、`completed-campus.jpg`、`offline.jpg` 保留为早期固定八单接入阶段的记录，不作为动态三十单的证明。
浏览器无 JavaScript error；存在原有 Three.js Clock 弃用和显卡 shader 精度 warning。
生产构建通过，仍有大资源 chunk 体积 warning，未据此宣称目标显卡帧率达标。
自然语言上游 API 本轮未发送真实聊天验收，界面维持“已配置、待联调”的真实状态。
