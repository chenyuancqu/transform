# 视觉样板资产重新筛选 · 2026-10-13

## 当前阶段

已创建分支 `visual-sample-20261013`。现有代码、后端、资源与未提交差异备份到 `output/checkpoints/visual-sample-before-20261013/`；没有复制私人 `.env`。

用户已登录 Sketchfab，三个获选模型已通过官方下载并实际加载。`/approved-asset-preview.html` 是本地 GLB 验收页；`/asset-review.html` 记录实际状态。生产场景尚未切换，新建筑 G1 尚未通过，详见 `docs/approved-assets-acceptance.md`。

## 当前候选 · 第二批

上一批四款资产已被用户全部否决。第二批两栋办公楼与无人机外观获得认可，两辆普通货车被否决。中型无驾驶室物流母车已改为本项目原创 GLB，外形已获用户确认。无人机仍需配套载货机构，不假定真实机型已具备当前演示的物流能力。

| 用途 | 原始模型 | 作者 | 官方三角形数 | 原始页面 |
|---|---|---|---|---|
| 写实办公楼 | London Office Building | Pukka Films | 86,001 | https://sketchfab.com/3d-models/london-office-building-8d3ea98595b4403cbf21065e8f9b7bb7 |
| 玻璃办公楼 | Office building | Nikitos & 3130 | 644,690 | https://sketchfab.com/3d-models/office-building-af9782245c134c21ae0c8df7f57077e6 |
| 工业四旋翼基底 | Quadcopter DJI Matrice 300 RTK | 19vitali99 | 904,053 | https://sketchfab.com/3d-models/quadcopter-dji-matrice-300-rtk-6677d02d66df4b73aad0d8e7bb9e3d9c |
| 无驾驶室物流母车 | Mother Carrier Original | 本项目原创 | 86,900（本地实测） | `/mother-preview.html` |

三款第三方官方元数据与下载弹窗均标注免费、CC Attribution 4.0。已取得并查看真实模型，许可记录和修改说明见 `docs/asset-licenses.md`。伦敦楼是局部立面，没有完整背面和屋顶，不能直接充当主楼。玻璃楼有完整体量及室内细节，但缺少明确主入口、材质偏暗，需再完善。无人机原始桨叶已拆为四组旋翼，保留机身和固定电机外壳；没有接入任务动画。原创母车沿用项目 ISC。

## 历史候选 · 第一批（全部淘汰）

| 用途 | 原始模型与作者 | 原始页面 | 官方数据 | 待检查 |
|---|---|---|---|---|
| 多层研发楼 | Building Modern Glass / overfota1988 | https://sketchfab.com/3d-models/building-modern-glass-1f79bf7c0d2c4d55b9958596543411a8 | 47,332 三角形；CC BY 4.0；可下载 | 尺寸、落地、入口、玻璃材质、背面、UV |
| 低层调度共享中心 | Modern Building - Gallery - Office / cjmitchell | https://sketchfab.com/3d-models/modern-building-gallery-office-5546323923cf4b539071809d87a3e3b8 | 4,995 三角形；CC BY 4.0；可下载 | 全套贴图、玻璃排序、连廊和作业入口 |
| 物流无人机 | DeliveryDrone / KonPrineas | https://sketchfab.com/3d-models/deliverydrone-bf65cd5ffe614ec18bb235d20caeeb1a | 231,230 三角形；CC BY 4.0；可下载；无预制动画 | 旋翼与护圈分离、电机轴心、原包裹分离、抓取机构、真实跨度 |
| 自主配送车 | ZEERY Autonomous Delivery Robot / eltayerkebulan | https://sketchfab.com/3d-models/zeery-autonomous-delivery-robot-351bfef8e7f6496ea78a72f0b45e1d12 | 679,567 三角形；CC BY 4.0；可下载；无预制动画 | 轮胎拆分、轴心、货舱与传感器、原型尺寸；它是小型配送车，不能简单放大充当母车 |

以上三角形数量以本地保存的官方 `/v3/models/{uid}` 元数据为准；不是运行时测量。没有看到 NoAI 标签，但仅完成公开元数据筛查；下载包附带条款还需复核。

原作者缩略图已人工查看并保留作者、原始链接及 CC BY 许可；没有用生成图代替原模型预览。候选元数据在 `public/assets/campus/review/shortlist.json`。

## 下载阻塞历史（已解决）

2026-10-13 早期未登录时，官方下载 API 返回 **401**。之后用户亲自在 Chrome 登录，已通过官方页面下载伦敦办公楼原始 ZIP、玻璃办公楼 4K GLB、无人机 GLB。没有提取浏览器 Cookie 或绕过登录。

优先选择 **GLB** 或 **glTF ZIP（包含 .gltf、.bin、textures）**。若仅提供 FBX/Blend，则保留原 ZIP 和贴图，另做导出；不要把单独的模型文件与贴图拆散。

下载文件放到项目根目录 `asset-inbox/`，也可保留下载目录并告知实际路径。该目录默认忽略；导入前逐包核验许可、来源、模型文件头与贴图依赖。只有通过检查的资产才迁移到 `public/assets/campus/`。

无人机、配送车没有预制动画。查看器能旋转只代表镜头可旋转，不代表旋翼、车轮、门可独立运动。取得文件后先检查节点；必要时在 Blender 拆分、设轴心。原型尺寸与接货机构决定最终母车造型，不能用非等比缩放或把小车放大来解决比例问题。

## 已排除

- 3DAssets.dev Heavy Lift Quadcopter Drone 和 Panel delivery van：虽然有 CC0 与节点信息，但实际缩略图仍显简化、缺少细致表面，不进入新样板。
- 约 500～650 三角形的 cargo quadcopter / delivery bot：不符合设备近景要求。
- BlenderKit Modern Glass Commercial Office Building、OFM Seeker Drone：外观有潜力，但 Royalty Free FAQ 要求发行内容中的资源不可容易提取；本项目公开 Git 仓库和浏览器 GLB 静态分发存在适配问题，暂不使用。
- 若干 AI 生成低层建筑：实际预览有立面熔合、局部结构模糊，未采用；高面数不代表高质量。
- Tonbo 和 Sci-Fi Drone 1：外观或飞行机构不符合此次物流四旋翼方向。

## 已取得的独立环境资源

已从官方 Poly Haven API 下载真实树木 Island Tree 02、Shrub 01、Painted Wooden Bench、三套 2K PBR 材质（aerial_asphalt_01 / pavement_03 / grass_path_2）以及 Kloofendal、Qwantani Noon 天空 HDRI。所有文件与官方 MD5 校验一致，清单为 `public/assets/campus/environment-assets.json`。

来源：https://polyhaven.com/license ，均为 CC0。下载脚本：`scripts/acquire-visual-sample.py`。目前仅下载，尚未接入场景或完成浏览器视觉验收。

## 后续验收顺序

1. 取得新建筑与设备文件，核验许可及贴图，检查四面、顶部和底部。
2. 建筑单楼与设备单体预览，使用实际米制尺度与自然日光，记录节点和尺寸。
3. 通过单体验收后组合一栋研发楼、庭院道路、真实植物、母车和一架无人机。
4. 接入后端遥测和进度，完善旋翼、姿态、轮胎和装卸动画；保持后端任务权威。
5. 再验收浅色 UI、镜头过渡、自由移动和实际完整取件回收过程。

此阶段不得标记为“视觉重建完成”。
