# 智联蜂群：移动母车与无人机协同取件

一辆移动母车与三架无人机的园区物流仿真平台。当前分支为 **`frontend-showcase-20261014V2`**：使用新训练的 PPO 策略自主选择订单与母车接应点，通过 Python 后端执行任务，浏览器实时展示三维场景和执行指标。

## 当前 V2 实现

- **动态订单**：开局随机生成 4–8 单，运行中每 12 个仿真秒尝试补入一单，每轮最多 30 单。订单使用 8 个已校准的阳台/地面取件点；点位占用时每 3 秒重试，取件后释放点位。暂停冻结任务，紧急返航停止接新订单并安全回收机队。
- **PPO 协同调度**：选择母车接应点，并为可用无人机滚动选单。新到订单在当前接应点交付完成前可由已回舱无人机补派，不中途取消已执行任务。
- **完整取件回收**：起飞、精确进近、稳定悬停、包裹装载、返航、单舱排队卸货、车顶归位与补能均由后端管理。全部已生成订单回收且订单流结束后，本轮才完成。
- **三维展示**：园区模型、设备跟随、自由漫游、日夜切换、轨迹、接应点及母车路线；任务卡展示波次和模型选单，联调面板展示真实候选评分。
- **实际执行指标**：订单到达数、回收数、完成率、平均完成时间、航程和无人机 Wh 能耗。
- **可选自然语言控制**：支持 OpenAI 兼容接口及 Gemini，将区域、设备和预算需求解析为调度指令；没有 AI Key 时，开始任务与预设调度仍可运行。

新 PPO 输出离散调度动作，不再输出旧版巡航 `dx/dy/dz`。精确飞行与取件仍由任务规则执行。当前没有接入真实车辆/无人机，也没有实现完整障碍物碰撞与实机飞行动力学。

## 快速启动（Windows）

建议使用 Node.js 20+、Python 3.10–3.12 和支持 WebGL 2 的 Chrome/Edge。启动脚本使用 PowerShell；后端日常运行只需 ONNX Runtime，不需要 PyTorch。

```powershell
git clone --branch frontend-showcase-20261014V2 --single-branch https://github.com/chenyuancqu/transform.git
cd transform\frontend
npm ci

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm run demo
```

已有仓库可先执行：

```powershell
git fetch origin
git switch frontend-showcase-20261014V2
git pull --ff-only
cd frontend
```

打开 **[http://127.0.0.1:3000/r3f.html](http://127.0.0.1:3000/r3f.html)**，点击“开始任务”。默认演示速度 1.5 倍，支持 0.3–2 倍。订单清单和到达提示会随运行中的新订单更新。

```powershell
npm run demo:stop
```

启动脚本优先使用 `frontend/.venv/Scripts/python.exe`，否则使用 PATH 中的 Python，并检查运行依赖。端口为 Vite `3000`、MQTT TCP `1883` 和 MQTT WebSocket `8083`；若已有本机 TCP Broker，会保留它并按需启动 WebSocket 桥接。日志在 `frontend/output/backend/`。

仅运行 `npm run dev` 只会启动前端，任务执行仍需要 Broker 与 Python 后端。默认开发端口也是 3000。

## 可选 AI 配置

在 `frontend` 中，仅首次创建本机配置：

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

在本机 `.env` 中填写自己的 `CAMPUS_AI_API_KEY`，并配置 `CAMPUS_AI_BASE_URL` 与 `CAMPUS_AI_MODEL`。环境配置不纳入版本控制，示例中不含密钥。直接使用 Gemini 提供方时还需安装 `google-genai`。

区域/设备/预算调度在当前波次回收后生效；暂停与急停立即生效。自然语言接口的配置状态和真实执行验证状态会分别显示。

## 模型与运行架构

```text
浏览器开始/预设/自然语言输入
            ↓ MQTT over WebSocket
本机 Broker ←→ Python MEC 服务
                       ├─ PPO：选订单、选母车接应点
                       ├─ 任务状态机：飞行、取件、回收、补能、动态补单
                       └─ 快照、执行回执、Wh 与时延统计
            ↓ MQTT 遥测
React / React Three Fiber / Three.js 三维控制台
```

| 模型 | 用途 |
|---|---|
| `frontend/backend/models/dispatch_v2.onnx` | 当前 V2 在线调度模型，CPU ONNX 推理 |
| `experiments/dispatch_v2/results/dispatch_policy.pt` | 训练后选出的 PyTorch 检查点 |
| `frontend/backend/models/dispatch_v2.json` | 来源检查点 SHA256、输入输出形状与导出校验 |
| `onnx_models/`、`frontend/public/models/` | 保留的旧 MADDPG 四模型，不作为 V2 默认调度策略 |

模型用 18 个槽位编码当前待取订单，并将输出槽位映射回真实订单编号。18 是单次决策容量，不是整轮订单上限；园区同时未取包裹受 8 个实际点位约束，整轮仍可累计到 30 单。

母车和无人机共用一个集中式策略，输入包含订单集合、设备电量/性能和母车位置，输出为 9 个接应点之一以及待取订单索引。`health.policyVersion=2`、`modelsLoaded=1`；完整决策随 `snapshot.dispatch` 发布。

## 训练结果与适用边界

离线训练目标为：

```text
平均订单完成时延（秒） + 6 × 每单无人机能耗（Wh）
```

两个随机种子分别从零训练 23,040 个任务，验证曲线进入平台。模型只按验证集选择，再使用 512 个独立场景评估：

| 指标 | 时间/能耗规则基线 | PPO | 改善 |
|---|---:|---:|---:|
| 平均订单完成时延 | 91.06 秒 | 89.49 秒 | 1.72% |
| 总无人机能耗/任务 | 109.14 Wh | 106.51 Wh | 2.41% |
| 综合目标 | 140.21 | 137.53 | 1.92% |

这是**静态订单、解析训练环境**的结果，不是动态园区展示的改善承诺。当前动态到单是迁移适配，尚未针对动态订单重新训练或证明优于规则；消融显示离线收益主要来自母车接应，学习选单的额外收益尚未证实。能耗参数未经实机标定，也不代表全局最优。

详见 [训练实验与复现](experiments/dispatch_v2/README.md)、[完整实验报告](experiments/dispatch_v2/REPORT.md)和[原始测试指标](experiments/dispatch_v2/results/summary.json)。

## 验证与开发

在 `frontend` 目录执行：

```powershell
npm run build
npm run test:backend
node --test tests/telemetry.test.js tests/device-motion.test.js tests/district-roads.test.mjs
npm run test:integration
node tests/backend-health-heartbeat.mjs
```

`test:integration` 需要演示服务已启动，会重置当前任务，通过真实 WebSocket 验证动态补单、30 单回收、暂停/急停/继续、重复指令、重置和旧轮次拒绝；结束后停在新任务待命状态。报告与截图位于 `frontend/output/v2-integration/`。

浏览器已验证波次面板、候选评分、设备与母车模型、暂停坐标冻结、区域预设、重置及断线重连。生产构建仍有大 chunk 提示，目标独立显卡帧率尚未专项验收；自然语言上游 API 本轮没有真实聊天验收。

## 代码与文档

- `experiments/dispatch_v2/`：环境、PPO 训练、评估、ONNX 导出、模型与实验记录。
- `frontend/backend/service.py`：MEC 服务、MQTT 通信、执行回执与模型健康状态。
- `frontend/backend/dispatch_v2.py`：动态订单窗口映射、模型选单、母车接应与波次执行适配。
- `frontend/backend/mission.py`：订单流及基础任务状态机。
- `frontend/src/services/useCampusBackend.js`：遥测校验、插值、指令与连接管理。
- `frontend/src/rendering/CampusProductionScene.jsx`：三维园区与设备展示。
- `frontend/src/ui/TaskConsole.jsx`、`V2DispatchPanel.jsx`：任务控制台与 PPO 决策面板。
- [V2 接入说明](frontend/docs/v2-integration.md)：接口、运行范围与验收。
- [素材许可](frontend/docs/asset-licenses.md)：外部模型与环境素材来源。

原版训练程序 `main.py`、`backend.py` 和四个 MADDPG Actor 保留作历史对照。设置 `CAMPUS_POLICY=legacy` 并重新启动后端可运行旧路径，对应 `npm run test:integration:legacy`。

团队：陈远、王维。代码许可证：ISC；外部素材遵循各自许可。
