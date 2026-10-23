# 智联蜂群 V2：园区协同取件演示

当前分支：`frontend-showcase-20261014V2`。PPO 在后端自主选择订单和母车接应点，浏览器通过 MQTT 接收任务快照并渲染，不在前端推理或判定订单完成。

## 启动

在本目录执行：

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm run demo
```

打开 [http://127.0.0.1:3000/r3f.html](http://127.0.0.1:3000/r3f.html)，点击“开始任务”。停止服务运行 `npm run demo:stop`。完整环境、模型与实验说明见[根 README](../README.md)。

启动脚本优先使用 `.venv`，否则检查 PATH 中的 Python。服务端口为 3000 / 1883 / 8083；若本机已有 TCP Broker，则按需补 WebSocket 桥接。只运行 `npm run dev` 不会启动任务后端。

自然语言 AI 可选：首次复制 `.env.example` 为本机 `.env` 并填写自己的配置；没有 Key 仍能运行 PPO 和预设调度。配置文件已忽略，不应提交密钥。

## 当前业务行为

- 开局随机 4–8 单，运行中每 12 仿真秒补单，每轮最多 30 单。
- 使用 8 个校准取件点；已占用时每 3 秒重试，包裹取走后点位可复用，不叠放未取订单。
- PPO 在波次边界对当前待取订单重新选单；18 个模型槽位映射真实订单 ID，整轮不受 18 单限制。
- 三架无人机并行取件，母车移动接应，单舱排队卸货，归位后开始下一波。
- 区域/设备/预算变更排队到当前波次结束后生效；暂停、急停立即冻结任务和订单流。
- 任务卡显示波次、接应点、分配关系和动态到达数；联调面板显示真实模型评分及 Wh 指标。
- 支持均衡 100% 或不均衡 42/68/91% 初始电量、0.3–2 倍速度、设备跟随、日夜切换和自由漫游。

当前模型由静态 9–18 单环境训练，动态园区属于迁移适配，不能直接套用离线改善比例。飞行与精确取件由规则执行，未接入实机或完整避障。

## 验证

```powershell
npm run build
npm run test:backend
node --test tests/telemetry.test.js tests/device-motion.test.js tests/district-roads.test.mjs
npm run test:integration
node tests/backend-health-heartbeat.mjs
```

集成测试会通过真实 WebSocket 重置并运行动态 30 单任务，验证补单、暂停/继续/急停、Wh 指标及旧指令拒绝，可能持续数分钟；报告在 `output/v2-integration/`。

- [V2 接入说明](docs/v2-integration.md)
- [训练与复现](../experiments/dispatch_v2/README.md)
- [离线实验报告](../experiments/dispatch_v2/REPORT.md)
- [素材许可](docs/asset-licenses.md)

## 入口与实现

默认任务入口为 `/` 和 `/r3f.html`；独立园区预览 `/campus-preview.html`，模型预览 `/approved-asset-preview.html`、`/mother-preview.html`。

当前链路为 `backend/service.py` → `backend/dispatch_v2.py` / `backend/mission.py` → MQTT → `src/services/useCampusBackend.js` → `CampusProductionScene.jsx` / `TaskConsole.jsx`。

`src/main.js`、`src/core/AIEngine.js` 及旧四个 ONNX Actor 保留作历史对照，默认任务页面不运行它们。旧模式需设置 `CAMPUS_POLICY=legacy` 并重启服务，对应 `npm run test:integration:legacy`。
