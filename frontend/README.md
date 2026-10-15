# 智联蜂群 - 数字孪生仿真系统

基于多智能体强化学习的移动母车与无人机协同智能取货系统的数字孪生可视化平台。

当前默认入口为 **MQTT 任务演示台**。ONNX推理、派单、移动、取件回收及统计在Python后端执行；浏览器只接收遥测并渲染。完整启动、协议、AI配置与验收见 [后端对接说明](docs/backend-integration.md)。

最新展示已接入获选真实办公楼、工业无人机和原创物流母车，采用明亮日光、深蓝科技 UI 与圆润动画风景观。任务场景 `/r3f.html`、独立园区预览 `/campus-preview.html`、单体验收 `/approved-asset-preview.html`。本轮实装及验收见 [2026-10-15 科技园区记录](docs/tech-campus-20261015.md)；更早的阶段记录见 [2026-10-14 园区样板](docs/visual-sample-20261014.md)。大模型文件保留高精度；超过 100MB 的资源后续需 Git LFS 或资产托管。

2026-10-15 更新：园区外围补入 32 栋授权办公楼派生模型，独立预览同步采用科技风面板。计入周边街区后，全近景上界预算约 98.7 万三角面、全远景约 56.8 万；默认加载的模型与共享纹理约 19.44 MiB。当前电脑为 UHD 770，RTX 3060 目标帧率仍待目标显卡实测；资源口径和限制见 [本轮实现与实测](docs/tech-campus-20261015.md)。原模型与素材源保留用于备份，不默认加载。

优化资产可用 `npm run assets:optimize` 重建，结构与预算测试运行 `npm run test:assets`；Kenney 源文件及许可保存在 `asset-sources/kenney-nature`。

## 项目特色

- 🤖 **后端AI推理**：Python ONNX Runtime 运行四个真实模型，MQTT驱动前端设备动画
- 🎮 **实时3D可视化**：基于 Three.js 的高质量园区场景渲染
- 📊 **完整性能统计**：任务完成率、电量管理、飞行距离等多维度数据
- 🎛️ **交互式控制**：支持暂停/恢复、速度调节、多视角切换

## 快速开始

### 安装依赖

```bash
npm install
```

Windows首次运行需要Python 3.12：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

### 启动完整演示

```bash
npm run demo
```

打开 `http://127.0.0.1:3000/r3f.html`。脚本启动本机Broker和MEC并检查四个模型就绪；仅开发前端时可运行 `npm run dev`。未配置Gemini Key时可使用真实预设调度，自然语言入口明确显示未配置。停止服务运行 `npm run demo:stop`。

### 构建生产版本

```bash
npm run build
```

## 技术栈

- **AI推理引擎**：Python ONNX Runtime（后端）
- **通信**：MQTT / MQTT over WebSocket
- **3D渲染**：Three.js / React Three Fiber
- **构建工具**：Vite
- **界面**：React / ES Module

## 项目结构

当前入口使用 `backend/mission.py`、`backend/service.py`、`backend/agent.py`，前端为 `src/rendering/CampusProductionScene.jsx`、`src/services/useCampusBackend.js` 与 `src/ui/TaskConsole.jsx`。以下目录图和后续物理说明包含原版实现，保留作历史对照；旧 `src/main.js` 与 `src/core/AIEngine.js` 已不由默认页面加载。当前接口与规则以 [后端对接说明](docs/backend-integration.md) 为准。

```
digital-twin-logistics/
├── public/
│   └── models/           # ONNX模型文件
│       ├── rover.onnx    # 母车决策模型
│       ├── uav_1.onnx    # 无人机1模型
│       ├── uav_2.onnx    # 无人机2模型
│       └── uav_3.onnx    # 无人机3模型
├── src/
│   ├── core/
│   │   ├── AIEngine.js         # AI推理引擎
│   │   └── SimulationState.js  # 仿真状态管理
│   ├── rendering/
│   │   ├── SceneManager.js     # 场景管理
│   │   ├── VehicleRenderer.js  # 母车渲染
│   │   ├── UAVRenderer.js      # 无人机渲染
│   │   └── OrderRenderer.js    # 订单渲染
│   └── main.js                 # 主程序入口
├── index.html
├── vite.config.js
└── package.json
```

## 功能说明

### 控制面板

- **▶ 开始**：启动仿真
- **⏸ 暂停**：暂停仿真
- **🔄 重置**：重置所有状态
- **仿真速度**：调节推理速度（0.5x - 2.0x）
- **摄像机视角**：
  - 上帝视角（俯瞰全局）
  - 跟随母车
  - 跟随无人机 1/2/3

### 性能统计

- **仿真时长**：累计运行时间
- **任务完成率**：已完成订单占比
- **已完成订单**：当前完成数 / 总数
- **平均电量**：3架无人机的平均剩余电量
- **充电次数**：累计充电事件
- **母车移动距离**：母车累计行驶距离（米）
- **无人机总飞行**：3架无人机累计飞行距离（米）

### 视觉特效

- ✨ **飞行轨迹线**：3条不同颜色的曲线追踪无人机路径
- ⚡ **充电光环**：母车周围螺旋上升的绿色粒子
- 🔋 **电量UI**：无人机头顶悬浮的实时电量条
- 📦 **包裹爆发**：订单完成时的粒子特效
- 💡 **低电量警告**：电量<20%时红色闪烁

## 场景设计

数字孪生场景模拟了**工业园区物流环境**：

- **地面**：100m × 100m 园区地面，带网格和道路标线
- **建筑**：6栋不同高度的厂房/仓库（10m-25m）
- **订单点**：8个分布在不同位置和高度的发光货箱
- **照明**：多光源系统（环境光、方向光、点光源）

## 算法说明

系统使用4个独立的强化学习模型（ONNX格式）：

1. **rover.onnx**：母车决策模型
   - 输入：母车位置、订单中心、剩余订单比例、平均电量
   - 输出：移动方向 [dx, dy]

2. **uav_1/2/3.onnx**：无人机决策模型
   - 输入：无人机位置、电量、相对母车位置、最近订单位置
   - 输出：飞行方向 [dx, dy, dz]

### 物理规则

- **电量消耗**：每步 -0.012
- **充电条件**：距离母车 < 8m 且高度 < 5m
- **订单完成**：无人机与订单距离 < 8m

## 开发团队

陈远、王维

## 参考项目

算法训练代码：https://github.com/chenyuancqu/transform

## License

ISC
