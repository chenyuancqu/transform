# G0 项目审查基线

日期：2026-10-10（Asia/Shanghai）

## 技术与入口

- 包管理：npm，`package.json` 仅有 `dev`、`build`、`preview` 脚本。
- 入口实现仍是原生 Three.js；当前 `package.json` 同时声明 React 19.3、React Three Fiber 9.8、Drei 10.7、Three 0.186 和 Vite 6.0，现有业务入口尚未迁移到 R3F。
- 主入口：`index.html` → `src/main.js`。
- 新增独立验收入口：`/campus-preview.html`，只加载主楼资产和展示层，不启动 AI 仿真。
- 构建命令：`npm run build`。
- 测试命令：仓库没有自动化测试脚本；G1 使用构建、浏览器加载、控制交互、截图和 WebGL renderer.info 验证。

## 业务锚点

- `src/core/SimulationState.js` 保存 rover、3 架 UAV、订单、充电和距离统计。
- `src/core/AIEngine.js` 读取 `public/models/*.onnx` 并推进仿真步骤。
- `src/rendering/UAVRenderer.js`、`VehicleRenderer.js`、`OrderRenderer.js` 读取业务坐标并渲染设备/订单。
- 原主页面的运行控制位于 `src/main.js`，包括开始、暂停、重置、速度和摄像机跟随。
- 本阶段只建立独立 G1 视觉验收，不改写业务状态机；园区生产场景接入留到 G2/G4。

## 资产审查

- 原 `public/models/buildings/*.glb` 三个文件均为 GitHub HTML 错误页，文件头不是 glTF，不能加载。
- 已接入 `public/models/buildings/modern-tower-office.glb`：公开直链、约 3.5 MB、真实现代办公塔楼，包含玻璃、挑板、竖向遮阳和屋顶构件；来源/许可见 `docs/asset-licenses.md`。
- 原程序化建筑主要集中在 `TechCampusScene.js`、`SceneManager.js`、`BuildingUtils.js`、`BuildingGenerator.js`，本阶段不作为主楼展示资产。

## 性能与视觉基线

- 旧页面此前报告的 FPS、draw calls 为估算值，没有固定视口、DPR、连续采样证据，因此不作为实测基线。
- 固定 G1 采样条件：Chromium，1280×800，DPR 1，默认斜角视角，空闲渲染 5 秒。
- G1 实测结果写入 `docs/campus-acceptance.md`，截图位于 `output/playwright/`。

## 可恢复点与风险

- 项目原先没有 Git 仓库；在任何改造前已初始化 Git 并创建提交 `39ab557 chore: capture pre-campus baseline`。
- 许可风险：镜像页同时标注 CC0 与原始 Sketchfab 的 CC BY 4.0 信息，当前按更严格的 CC BY 4.0 使用并保留署名。
- 当前业务入口仍是原生 Three.js；若后续必须迁移到 R3F，应作为单独架构任务，不在 G1 隐式切换。

## G1 后续计划

G1 通过后再进入 G2：调度中心、中央花园、道路、停机坪和业务无人机的空间接入；G2 不得把程序化 BoxGeometry 主楼重新带回展示中心。

