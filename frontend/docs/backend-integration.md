# 空地协同任务演示台：后端接入与运行

实施日期：2026-10-13。依据上游 `chenyuancqu/transform` 的 `8849daf9c3c2d74eec42796461fc9feb6aeefb26`，实际使用相同的四个 ONNX 权重。上游文件没有被修改；本项目补充了其随机模拟器尚未具备的可视任务闭环。

## 职责边界

`backend/service.py` 是本机 MEC 进程，加载四个真实 ONNX，使用上游母车6维/UAV10维观测、2维/3维动作。`backend/mission.py` 管理母车、无人机、包裹、派单、飞行、稳定悬停、装载、返航、回收、暂停、速度和统计。为便于第一版启动，模拟器、推理及可选 Agent 位于同一个 Python 服务，具有独立网络输入队列；不是浏览器模拟，也不是直接运行上游的随机遥测脚本。

浏览器 `src/services/useCampusBackend.js` 只负责 MQTT 连接、协议验证、坐标转换和显示快照插值。`CampusProductionScene.jsx` 仅绘制模型、旋翼、吊具、包裹及镜头。没有 ONNX 推理、动作累加位移、订单分配或到达判定。`index.html` 和 `r3f.html` 均进入这一新架构；`src/core` 的旧实现暂留为历史对照/回归测试，不参与这两个页面的运行。

每轮启动和重置时，后端会从 8 个已核验的阳台/中庭地面取件锚点中随机抽取 4–8 个不重复点位作为初始订单，并为本轮订单重新编号。任务运行时，每 12 个仿真秒补入一单，最多 30 单；若该调度范围内的取件点暂时都被未取订单占用，则每 3 个仿真秒重试。订单取走后释放原点位供后续新单使用，同一时刻不会在一个阳台/地面点叠放多个未取订单。点位直接使用已校准坐标、不加随机偏移，因此订单不会悬空。初始订单覆盖 A/B/C 区，且至少有 2 个 B 区订单以支持双机加急预设；区域专项调度只会在所选区域内补单。

任务开始前可在左侧选“均衡 100%”或“不均衡 42/68/91%”初始电量。切换只允许发生在本轮尚未运行时，会重置本轮订单并生成新任务轮次；开始后该选项锁定。重置会保留选定模式。开场三架无人机分别停在母车车顶的三个紧凑充电/运输托架上，点击开始后镜头短暂跟随母车，方便看清无人机垂直爬升至 5.5m 的起飞过程，随后回到演示视角；用户主动换镜头时不会被自动切回。无任务或能量余量不足的无人机返回车顶托架；在托架上补能，位置随母车车身和朝向更新，母车移动时飞机随车同行。满电状态为“母车待命”，补能状态为“母车补能”。托架与单一货物回收舱分开布置；返航卸货仍使用原有 FIFO 舱口队列。所有订单回收、无人机归位且补能完成后，本轮才自动结束。

巡航使用真实 ONNX 动作，延续此前放慢的 .0075/.015 位移系数。旧模型会产生远离目标的动作，后端对不推进目标的动作采用有界目标引导；18m 内以 ≤3m/s 精确进近。母车限制在中央业务区，接近回收时停车。该版本是“ONNX 巡航 + 后端任务监督”，不能称为纯模型端到端控制。没有重新训练权重，也没有实现动态云边卸载。

到达条件：水平偏差 ≤0.35m、高差 ≤0.20m、速度 ≤0.15m/s，连续0.8仿真秒。装载3秒，母车入舱1.5秒，全部由后端推进。暂停会同时冻结位置、装载/卸载进度和统计。前端以160ms延迟快照插值，动画进度与设备位置使用同一时间线；不等待浏览器回调才能完成业务任务。断线后冻结显示且禁用指令；后端失去 Broker 时自动暂停，重连需要手动继续。

## 本机运行

已创建项目 `.venv` 并安装 `backend/requirements.txt`。当前机器可在项目目录执行：

```powershell
npm run demo
```

访问 `http://127.0.0.1:3000/r3f.html`。点击“开始任务”或预设调度；点击左侧设备/包裹可定位近景。“自由漫游”支持 WASD、Q/E、右键转向、Shift 加速、Esc 退出。

服务：Vite 3000；真实 Aedes Broker TCP 1883、WebSocket 8083 `/mqtt`；Python MEC 通过 TCP 连接 Broker。均用于本机演示，监听回环地址。后端未开额外 HTTP 端口。

启动脚本 `scripts/start-demo.ps1` 隐藏后台窗口，记录自建进程、复用已有服务、以新鲜 MQTT 快照检查后端四个模型是否就绪。重复运行已验证不会新增 MEC 进程。日志和 PID 记录在 `output/backend/`。`npm run demo:stop` 停止由该脚本记录的服务，保留原有外部 Vite 进程。

新电脑第一次运行：安装 Node.js 20+ 和 Python 3.12，然后执行：

```powershell
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm run demo
```

模型文件为项目的 `public/models/rover.onnx`、`uav_1.onnx`、`uav_2.onnx`、`uav_3.onnx`，并与仓库根目录 `onnx_models/` 同步。当前模型接受母车 6 维 / 无人机 10 维观测，输出 2 维 / 3 维动作；后端按 ONNX 声明的输入名绑定张量。页面不请求这些文件，不使用 ONNX Runtime Web。GLB、建筑尺度和署名保持现有配置。

## MQTT 契约

原始三类主题保持兼容；新增完整快照和回执来避免不同设备、订单消息到达顺序导致画面不一致。控制/聊天消息均 QoS 1、不 retained。服务忽略 retained 指令，缓存最近256条有 `request_id` 的执行回执，重复投递返回原结果。此缓存仅在服务本次运行期间有效。

| 主题 | 方向 | 内容 |
| --- | --- | --- |
| `simulation/state/{mother,uav_1,uav_2,uav_3}` | 后端→前端 | `id,status,battery(0–100),position,target,state,phase,epoch,seq,coordinate_system`；`state` 仍是6/10维模型观测，绝不当作地图位置 |
| `simulation/action/{id}` | 后端→前端 | 原格式 `[[dx,dy]]` / `[[dx,dy,dz]]`；只用于联调，前端不积分动作 |
| `simulation/command/input` | 前端→Agent | `{request_id,text}`，用户已确认此输入主题 |
| `simulation/command/agent` | Agent/预设→后端 | 原结构化字段，扩展 `request_id,source`；后端验证并执行 |
| `simulation/control` | 前端→后端 | `{request_id,action:'start'/'pause'/'reset'/'speed'/'battery_mode',value?}`；`battery_mode` 的值为 `balanced` 或 `imbalanced`，仅任务开始前接受 |
| `simulation/snapshot` | 后端→前端 | retained 的一致快照：`schema_version:1,epoch,seq,timestamp,coordinate_system,running,speed,batteryMode,elapsedSeconds,rover,uavs,orders,stats,health,events,lastCommand`；`orders` 每轮初始为 4–8 单，运行中逐步补到最多 30 单 |
| `simulation/command/result` | 后端→前端 | `{request_id,ok,message,timestamp,command?,epoch?}`，界面凭执行回执显示成功，不凭发布动作显示成功 |
| `simulation/agent/status` | Agent→前端 | `{request_id,status:'parsing'/'error',message}` |
| `simulation/backend/status` | 后端→前端 | retained 可用状态，含 `online,modelsLoaded,agentConfigured`；离线遗嘱 `online:false` |

坐标固定标记 `campus_meters_xy_height`：`position:[水平x米,水平y米,高度米]`；Three 使用 `[x,高度,y]`。模型内部仍是0–1归一化坐标，水平映射 `200*v-100`，高度 `50*v`。完整快照中的电量为0–1，独立 state 主题电量为0–100，与用户接口文档一致。快照/状态带 `epoch` 区分重置前后，`seq` 拒绝同轮次旧帧。前端不猜测缺失单位；非法消息不能驱动场景。超过1.8秒的新鲜度检查会冻结画面。

## 调度和指标含义

- 常规取件：所有无人机覆盖本轮随机生成的订单；园区订单流运行期间每 12 个仿真秒向空闲取件锚点补入一单，整轮上限 30 单。
- B区加急：仅 UAV1、UAV3 接取本轮生成的 B 区订单（初始至少 2 单，订单编号随生成结果变化）；运行时的新订单也限定在 B 区。加急可以取消尚未装载的旧预约，装载中和已携货的任务会先安全回收；该区域完成后自动暂停，其它区域保持待派发。
- 节能调度：降低目标引导和返航速度至3.5m/s，使用此前仿真耗电系数的0.8倍率，并按剩余预算与估算往返成本决定是否接新订单。`energy_limit` 是每次指令重置的单机仿真能耗预算，优先完成在途包裹，不代表物理电量硬约束或求得全局最优解。
- 无人机低于估算往返能量加 5 个百分点余量时不接新单；无任务时返回母车车顶托架并随车移动，补能后再接受任务，以免长订单流把电量耗尽仍继续派单。
- 紧急停止：停止整个集群并保留当前位置、预约、包裹及动画进度。
- “无人机已取货”与“订单完成并回收”分别计数。订单完成率按已回收到母车的订单数除以本轮订单数计算；平均完成时间按每单生成至回收的仿真秒数计算；平均单能耗按每个已回收订单对应无人机的电量百分点均值计算。航程来自实际仿真位置增量（米），未完成订单的平均项显示“—”。能耗百分点不是 kWh。推理时间是 Python 实测一次 4 模型批次耗时。没有虚构能源趋势、物联网负载或动态卸载指标。

## 可选自然语言服务

自然语言调度现通过后端 `backend/agent.py` 接入 DeepSeek OpenAI 兼容接口。用户密钥只保存到 Git 忽略的 `.env`，文档、网页、遥测和测试报告不包含实际密钥。当前配置使用 `https://api.deepseek.com` 与 `deepseek-flash`。未配置时显示“AI未配置”；已配置但接口断开时显示“AI接口未连接”，不会拿“有Key”当作“已连接”。预设调度始终独立可用。

`.env` 字段为 `CAMPUS_AI_BASE_URL`、`CAMPUS_AI_API_KEY`、`CAMPUS_AI_MODEL`。后端以 Bearer 鉴权请求 `/chat/completions`；DeepSeek 使用配置的 `deepseek-flash`，其它兼容网关仍可通过 `/models` 检查模型。消息只携带系统调度协议和用户需求。无代理和自动重定向，错误提示不转发网关响应正文或凭据。模型不可用时明确返回错误。

也保留不设置兼容接口时的 Gemini 直连模式：读取 `GEMINI_API_KEY` 和可选 `GEMINI_MODEL`。改变配置后需要重启本项目后端（`npm run demo:stop`、`npm run demo`）。AI 接口断开后每5秒自动检查，健康时每30秒检查；恢复后自动开放聊天输入。AI解析出的字段仍由权威任务服务验证，并返回执行回执。

AI 页面区分“已配置·待联调”和真实 AI 成功，不生成模拟回复。本项目暂停、急停或重置后，原解析请求的任务轮次及控制版本失效，迟到 AI 结果将被拒绝。前端确认超时显示“执行状态待确认”，不会错误地宣称未执行。

## 验证命令与恢复点

```powershell
npm run test:backend
node --test tests/telemetry.test.js tests/pickup.test.js
npm run test:integration
npm run build
```

MQTT 集成测试会重置演示、验证运行中订单补入并实际推进设备任务，所以不要在正式演示中同时执行。完整真实模型回收另由后端单元测试覆盖。集成测试报告：`output/backend/mqtt-integration.json`。

大量改造前保留了原有未提交内容，创建分支 `backend-task-console-20261013`；恢复备份在 `output/checkpoints/backend-migration-before/`，含 tracked.patch、src 和入口/依赖文件。未覆盖或提交原有未提交工作。
