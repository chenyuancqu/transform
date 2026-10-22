# “智联蜂群”——基于多智能体强化学习的移动母车与无人机协同智能取货系统

> **创新大赛评审交付包** | 团队成员：陈远、王维  
> **核心定位**：面向未来智慧物流场景，融合“移动母车+无人机蜂群”多智能体协同算法与现代三维数字孪生可视化平台。

---

## 🌟 项目三大核心创新亮点

### 1. 业务模式创新：“一车多机”重构末端分散取货
- **从串行到并行**：传统物流依赖人工/单车逐点取货，路径冗长耗时；本项目通过“移动母车 + 3架工业级无人机”蜂群架构，实现多任务空间高并发并行揽收。
- **动态移动接应**：母车不仅是移动货物集散仓，更是智能“移动充电站”，随订单重心动态机动，极大压缩无人机往返能耗与航程。

### 2. 算法与控制创新：多智能体深度强化学习（MADDPG）
- **多智能体博弈决策**：部署 4 套深度强化学习神经网络（1个母车决策模型 + 3个无人机协同模型）。
- **梯次补能与自主返航**：低电量无人机自主抛物线返航母车车顶物理托架快速充电，满电智能体持续作业，保证任务无缝衔接。
- **全闭环物理仿真**：母车与无人机具有真实加减速、电量消耗速率（-0.012/步）、垂直爬升（5.5m）、三维空间精准避障与包裹揽收判断。

### 3. AI 调度创新：DeepSeek 大模型自然语言意图调度
- **自然语言直接对话**：集成 DeepSeek 官方大模型 API，支持评委输入自然语言指令（例如：“*派1号和2号机去B区加急取件*”、“*全员紧急停止*”）。
- **零配置开箱即用**：**已预置并校验 DeepSeek 官方 API Key**，国内直连稳定高响应，评委无需额外注册与申请。

---

## 📁 项目目录结构说明

```
digital-twin-logistics/
├── main.py                      # MADDPG 多智能体算法训练主程序 (PyTorch)
├── backend.py                   # 算法 MQTT 调度服务端 (Python ONNX Runtime)
├── export_onnx.py               # PyTorch 训练权重导出 ONNX 脚本
├── agent_server.py              # CLI 终端 DeepSeek AI 智能调度服务
├── simulator_client.py          # 算法仿真测试客户端
├── requirements.txt             # Python 后端算法与推理环境依赖清单
├── maddpg_convergence_curve.png # 强化学习算法训练收敛曲线图 (评审数据)
├── models/                      # PyTorch 神经网络模型结构定义 (Actor/Critic)
├── onnx_models/                 # 已导出的 4 个 ONNX 决策模型 (母车+3无人机)
├── saved_models/                # MADDPG 强化学习训练检查点权重文件
├── docs/                        # 完整项目文档库 (含比赛申报信息、技术文档、验收记录)
│   ├── 项目信息.txt              # 大赛申报资料、核心架构与接口规范
│   └── codex实施文档.md          # 现代高级智慧园区数字孪生实施规范
└── frontend/                    # 数字孪生 3D 可视化系统 & MEC 后端服务
    ├── .env                     # DeepSeek AI Key 配置文件 (已预置生效)
    ├── package.json             # 前端依赖配置 (Three.js / React Three Fiber / MQTT)
    ├── backend/                 # MEC 边缘协同服务、任务状态管理与 AI 调度接口
    ├── src/                     # React Three Fiber 三维场景与圆通紫主题控制台源码
    ├── public/                  # 3D 资产 (现代写字楼、无人机、母车、HDR环境、ONNX模型)
    ├── scripts/                 # 一键启动与资产优化脚本 (start-demo.ps1)
    └── output/                  # 自动化测试验收报告与评审截图证据
```

---

## 🔑 AI 接口配置状态 (评委即开即用)

项目已在 `frontend/.env` 中完整配置 DeepSeek 调度大模型服务，并通过连通性校验：

```env
CAMPUS_AI_BASE_URL=https://api.deepseek.com
CAMPUS_AI_API_KEY=sk-644d28ae9da145f182eb022c8894aa0f
CAMPUS_AI_MODEL=deepseek-flash
```

- **状态**：已配置且通过自动化测试
- **网络**：国内官方直接调用，无需代理与科学上网。

---

## 🚀 快速启动与评审演示步骤

### 运行环境要求
- **Node.js**：18.0+ 推荐
- **Python**：3.10 ~ 3.12（运行后端 ONNX 推理与 MEC 业务服务）
- **现代化浏览器**：Chrome / Edge（支持 WebGL 2.0）

### 方案 A：一键启动完整数字孪生演示（推荐）

1. 打开终端进入 `frontend` 目录：
   ```powershell
   cd frontend
   npm install
   ```

2. 首次运行配置 Python 依赖：
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
   ```

3. 一键启动全套服务（自动唤起 MQTT Broker、MEC 仿真服务与 Vite 服务）：
   ```powershell
   npm run demo
   ```

4. 打开浏览器访问：
   **`http://127.0.0.1:3000/r3f.html`**
   （进入现代高级智慧园区空地协同三维演示大屏，支持上帝视角、母车跟随、无人机跟随、实时遥测数据监控及 DeepSeek AI 调度输入）。

5. 停止演示服务：
   ```powershell
   npm run demo:stop
   ```

---

### 方案 B：纯前端 3D 场景开发预览

如仅评审三维视觉设计与前端交互：
```powershell
cd frontend
npm install
npm run dev
```
访问控制台输出的本地服务地址（如 `http://localhost:5173/r3f.html`）。

---

### 方案 C：CLI 终端 AI 智能调度体验

如需在终端直接向 AI 调度员下达指令并观察结构化参数：
```powershell
python agent_server.py
```
在提示符下输入指令（例如：“*让 1 号机前往 B 区加急取包裹，能耗限制 80%*”），AI 将实时解析并输出标准调度 JSON。

---

## 📊 核心算法模型清单

| 模型文件 | 决策智能体 | 输入维度 | 输出维度 | 核心控制目标 |
| :--- | :--- | :--- | :--- | :--- |
| `rover.onnx` | 地面移动母车 | Float32Array[1, 6] | Float32Array[1, 2] | 母车向未完成订单重心机动，缩短协同半径 |
| `uav_1.onnx` | 1号协同无人机 | Float32Array[1, 10] | Float32Array[1, 3] | 三维空间导航、包裹接近、梯次电量管理 |
| `uav_2.onnx` | 2号协同无人机 | Float32Array[1, 10] | Float32Array[1, 3] | 三维空间导航、包裹接近、梯次电量管理 |
| `uav_3.onnx` | 3号协同无人机 | Float32Array[1, 10] | Float32Array[1, 3] | 三维空间导航、包裹接近、梯次电量管理 |
