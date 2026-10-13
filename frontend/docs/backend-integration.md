# 空地协同任务演示台：后端接入与运行

实施日期：2026-10-13。依据上游 `chenyuancqu/transform` 的 `8849daf9c3c2d74eec42796461fc9feb6aeefb26`，实际使用相同的四个 ONNX 权重。上游文件没有被修改；本项目补充了其随机模拟器尚未具备的可视任务闭环。

## 职责边界

`backend/service.py` 是本机 MEC 进程，加载四个真实 ONNX，使用上游母车6维/UAV10维观测、2维/3维动作。`backend/mission.py` 管理母车、无人机、包裹、派单、飞行、稳定悬停、装载、返航、回收、暂停、速度和统计。为便于第一版启动，模拟器、推理及可选 Agent 位于同一个 Python 服务，具有独立网络输入队列；不是浏览器模拟，也不是直接运行上游的随机遥测脚本。

浏览器 `src/services/useCampusBackend.js` 只负责 MQTT 连接、协议验证、坐标转换和显示快照插值。`CampusProductionScene.jsx` 仅绘制模型、旋翼、吊具、包裹及镜头。没有 ONNX 推理、动作累加位移、订单分配或到达判定。`index.html` 和 `r3f.html` 均进入这一新架构；`src/core` 的旧实现暂留为历史对照/回归测试，不参与这两个页面的运行。

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

模型来源是项目的 `public/models/rover.onnx`、`uav_1.onnx`、`uav_2.onnx`、`uav_3.onnx`。页面不请求这些文件，不使用 ONNX Runtime Web；已有历史依赖和模型文件暂保留。GLB、建筑尺度和署名保持现有配置。

## MQTT 契约

原始三类主题保持兼容；新增完整快照和回执来避免不同设备、订单消息到达顺序导致画面不一致。控制/聊天消息均 QoS 1、不 retained。服务忽略 retained 指令，缓存最近256条有 `request_id` 的执行回执，重复投递返回原结果。此缓存仅在服务本次运行期间有效。

| 主题 | 方向 | 内容 |
| --- | --- | --- |
| `simulation/state/{mother,uav_1,uav_2,uav_3}` | 后端→前端 | `id,status,battery(0–100),position,target,state,phase,epoch,seq,coordinate_system`；`state` 仍是6/10维模型观测，绝不当作地图位置 |
| `simulation/action/{id}` | 后端→前端 | 原格式 `[[dx,dy]]` / `[[dx,dy,dz]]`；只用于联调，前端不积分动作 |
| `simulation/command/input` | 前端→Agent | `{request_id,text}`，用户已确认此输入主题 |
| `simulation/command/agent` | Agent/预设→后端 | 原结构化字段，扩展 `request_id,source`；后端验证并执行 |
| `simulation/control` | 前端→后端 | `{request_id,action:'start'/'pause'/'reset'/'speed',value?}` |
| `simulation/snapshot` | 后端→前端 | retained 的一致快照：`schema_version:1,epoch,seq,timestamp,coordinate_system,running,speed,elapsedSeconds,rover,uavs,orders,stats,health,events,lastCommand` |
| `simulation/command/result` | 后端→前端 | `{request_id,ok,message,timestamp,command?,epoch?}`，界面凭执行回执显示成功，不凭发布动作显示成功 |
| `simulation/agent/status` | Agent→前端 | `{request_id,status:'parsing'/'error',message}` |
| `simulation/backend/status` | 后端→前端 | retained 可用状态，含 `online,modelsLoaded,agentConfigured`；离线遗嘱 `online:false` |

坐标固定标记 `campus_meters_xy_height`：`position:[水平x米,水平y米,高度米]`；Three 使用 `[x,高度,y]`。模型内部仍是0–1归一化坐标，水平映射 `200*v-100`，高度 `50*v`。完整快照中的电量为0–1，独立 state 主题电量为0–100，与用户接口文档一致。快照/状态带 `epoch` 区分重置前后，`seq` 拒绝同轮次旧帧。前端不猜测缺失单位；非法消息不能驱动场景。超过1.8秒的新鲜度检查会冻结画面。

## 调度和指标含义

- 常规取件：所有无人机覆盖全部8个包裹。
- B区加急：仅 UAV1、UAV3 接取B区包裹3、4、8。加急可以取消尚未装载的旧预约，装载中和已携货的任务会先安全回收。该区域完成后自动暂停，其它区域保持待派发。
- 节能调度：降低目标引导和返航速度至3.5m/s，使用此前仿真耗电系数的0.8倍率，并按剩余预算与估算往返成本决定是否接新订单。`energy_limit` 是每次指令重置的单机仿真能耗预算，优先完成在途包裹，不代表物理电量硬约束或求得全局最优解。
- 紧急停止：停止整个集群并保留当前位置、预约、包裹及动画进度。
- “已装载”与“母车已回收”分别计数。航程来自实际仿真位置增量（米）；时延是从本轮任务起点至每单回收的仿真秒数均值；未回收时显示“—”。能耗是3机累计消耗的电量百分点，不是kWh。推理时间是 Python 实测一次4模型批次耗时。没有虚构能源趋势、物联网负载或动态卸载指标。

## 可选自然语言服务

用户后续提供了本机 OpenAI 兼容网关 `http://127.0.0.1:8045/v1`；现使用后端 `backend/agent.py` 接入。用户密钥只保存到 Git 忽略的 `.env`，文档、网页、遥测和测试报告不包含实际密钥。模型列表已经实际读取，自动选中与仓库一致的 `gemini-2.5-flash`。未配置时显示“AI未配置”；已配置但接口断开时显示“AI接口未连接”，不会拿“有Key”当作“已连接”。预设调度始终独立可用。

本地网关的 `.env` 字段为 `CAMPUS_AI_BASE_URL`、`CAMPUS_AI_API_KEY`，可选 `CAMPUS_AI_MODEL`。后端以 Bearer 鉴权请求 `/models` 和 `/chat/completions`；通过实际模型列表选择模型，消息只携带系统调度协议和用户需求。无代理和自动重定向，错误提示不转发网关响应正文或凭据。未指定模型时优先选择 `gemini-2.5-flash`；模型不可用时明确返回错误。

也保留直连Google的模式：不设置网关地址时读取 `GEMINI_API_KEY` 和可选 `GEMINI_MODEL`。改变配置后需要重启本项目后端（`npm run demo:stop`、`npm run demo`），不会停止用户提供的8045服务。网关断开后每5秒自动检查，健康时每30秒检查；恢复后自动开放聊天输入。AI解析出的字段仍由权威任务服务验证，并返回执行回执。真实聊天联调结果见验收文档。

最终联调状态：模型列表成功，真实聊天返回503（Google OAuth令牌刷新连接失败）。按用户要求保留配置、停止继续测试，由用户后续修复网关上游连接。页面区分“已配置·待联调”和真实AI成功，不生成模拟回复。后续网关修复后可直接在聊天框重试；地址/Key不变时不需要重新配置。本项目暂停、急停或重置后，原解析请求的任务轮次及控制版本失效，迟到AI结果将被拒绝。前端确认超时显示“执行状态待确认”，不会错误地宣称未执行。

## 验证命令与恢复点

```powershell
npm run test:backend
node --test tests/telemetry.test.js tests/pickup.test.js
npm run test:integration
npm run build
```

MQTT集成测试会重置演示并实际运行8单，所以不要在正式演示中同时执行。集成测试报告：`output/backend/mqtt-integration.json`。

大量改造前保留了原有未提交内容，创建分支 `backend-task-console-20261013`；恢复备份在 `output/checkpoints/backend-migration-before/`，含 tracked.patch、src 和入口/依赖文件。未覆盖或提交原有未提交工作。
