# 资产许可记录

## G1 主楼

| 文件 | 用途 | 原始来源 | 作者 | 许可 | 下载日期 | 备注 |
|---|---|---|---|---|---|---|
| `public/models/buildings/modern-tower-office.glb` | G1 单栋主楼预览 | [Sketchfab 短链](https://skfb.ly/oTEUX) / [规范化原始页](https://sketchfab.com/3d-models/modern-tower-office-apartment-house-home-a057bf3379b24c23a18a82ec884e4f04) / [API 元数据](https://api.sketchfab.com/v3/models/a057bf3379b24c23a18a82ec884e4f04) | zigurat architecture studio | CC BY 4.0 | 2026-10-10 | 原始 API 明确标注 CC Attribution、允许商业使用且要求署名；GLB 通过公开镜像页直链取得。 |

署名文本：`“modern tower office apartment house home” by zigurat architecture studio, licensed under Creative Commons Attribution 4.0.`

镜像页同时把该文件标为 CC0，但其页面也明确给出 Sketchfab 原作者和 CC BY 4.0 归属。为避免过度授权，本项目暂按更严格的 CC BY 4.0 执行；如果要公开发布，请保留上面的署名文本和两个来源链接，并在后续取得作者/平台的直接确认后再升级许可结论。

## 原创快递包裹（2026-10-13）

`src/rendering/ParcelModel.jsx` 为本项目内原创的三维纸箱组件，实际尺寸 0.65×0.50×0.50m，包含封箱胶带、箱盖接缝、运单和程序绘制条码。未下载第三方模型或贴图；组件源码沿用本项目的 ISC 许可。建筑 GLB 的 CC BY 4.0 署名要求继续保留。

## 原有失效文件（说明）

`simple-building.glb`、`building-02.glb`、`test-model.glb` 原本扩展名为 `.glb`，但文件头是 GitHub HTML 页面（不是 `glTF` 二进制头），无法作为模型加载，未进入新场景，也没有可核验的作者或许可信息。

## 2026-10-13：用户获选资产的官方下载

以下路径相对于 `public/assets/campus/`。全部第三方文件在用户亲自在 Chrome 登录后，使用作品页面的官方 Download 控件取得。

| 文件 | 作品 / 作者 | 来源 | 许可及修改 |
|---|---|---|---|
| `buildings/london-office/model.glb` | London Office Building / Pukka Films | [官方作品页](https://sketchfab.com/3d-models/london-office-building-8d3ea98595b4403cbf21065e8f9b7bb7) | CC BY 4.0；原文件未修改，展示居中落地 |
| `buildings/glass-office/model.glb` | Office building / Nikitos & 3130 | [官方作品页](https://sketchfab.com/3d-models/office-building-af9782245c134c21ae0c8df7f57077e6) | CC BY 4.0；原文件未修改，等比展示尺度标定及朝向调整 |
| `drones/matrice-300/model.glb` | Quadcopter DJI Matrice 300 RTK / 19vitali99 | [官方作品页](https://sketchfab.com/3d-models/quadcopter-dji-matrice-300-rtk-6677d02d66df4b73aad0d8e7bb9e3d9c) | CC BY 4.0；官方原文件保留 |
| `drones/matrice-300/flight-ready.glb` | 同上 | 同上 | CC BY 4.0；移除独立展示箱，八片原始桨叶拆为四个 Y 轴旋翼，固定电机外壳和机身保留 |
| `vehicles/mother-carrier-original.glb` | Mother Carrier Original / 本项目原创 | `src/rendering/MotherVehicleAsset.js`、`scripts/export-mother-model.mjs` | ISC；没有第三方车体或贴图，用户已确认外形 |

下载日期：**2026-10-13**。伦敦楼原始 ZIP 内的 GLB 已内嵌 43 张贴图，另附贴图保留在忽略的 `asset-inbox/`；玻璃楼下载 4K GLB，内嵌 3 张贴图。无人机采用无贴图的多材质建模，并非漏下载贴图。三款 GLB 均实际加载检查。

官方下载弹窗明确写明作者需署名、允许商业使用。标准 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 允许分享及改编，包括网页分发，要求署名、许可链接及修改说明。公开元数据筛查未发现 NoAI 标签，也未遇到下载包额外条款；不将此结论扩展到其他模型或品牌背书。验收网页显示作者、原始链接、许可及修改摘要。

保留以下署名文本并附原始链接、CC BY 4.0 链接：

- “London Office Building” by Pukka Films, licensed under CC BY 4.0. Display placement adjusted; original file unchanged.
- “Office building” by Nikitos & 3130, licensed under CC BY 4.0. Display scale and orientation adjusted; original file unchanged.
- “Quadcopter DJI Matrice 300 RTK” by 19vitali99, licensed under CC BY 4.0. Modified: display case removed; original blades separated into four animated rotor pivots.

来源、SHA-256、体积、原始尺寸及状态保存在 `public/assets/campus/approved-assets.json`。尺寸标定是展示设定，不是测绘或制造商参数；载货机构尚未建立，不能声称真实 Matrice 300 自带本项目物流能力。



## 2026-10-14：运行派生资产与景观

- `buildings/glass-office/daylight-ready.glb`：由已下载的 Office building（Nikitos & 3130，CC BY 4.0）改编；等比米制标定、日光材质、实际入口开洞、复用原始幕墙改造背面。原文件保留。
- `buildings/glass-office/dispatch-centre.glb`：上述模型的低层改编，保留楼层间距，截取上部楼层并迁移原始屋顶；CC BY 4.0。
- 入口雨棚、招牌、太阳能板、天窗、空调设备以及无人机吊具由本项目原创代码构建，ISC。无人机吊具不属于原模型或制造商装备。
- 原创母车新增真实接货开口、货仓和输送细节，ISC；已接入后端单舱调度。

运行页面保留作者、原始来源、CC BY 4.0 链接与修改说明。署名：Office building by Nikitos & 3130, CC BY 4.0; modified scale, materials, entrance, rear facade and low-rise derivative. Quadcopter DJI Matrice 300 RTK by 19vitali99, CC BY 4.0; original rotor blades separated, display case removed, original demonstration cargo rig added.

以下均为 Poly Haven 官方下载的 CC0 资源，许可链接 [Poly Haven license](https://polyhaven.com/license)，不使用未知镜像。下载及核验日期、各文件官方 MD5 和路径保存在 `public/assets/campus/environment-assets.json`。

| 资源 | 来源 | 实际用途 |
|---|---|---|
| Island tree 02 | https://polyhaven.com/a/island_tree_02 | 周边行道树；补充官方叶片 alpha 遮罩 |
| Jacaranda tree | https://polyhaven.com/a/jacaranda_tree | 四处休憩区树冠；补充官方叶片 alpha 遮罩 |
| Shrub 01 | https://polyhaven.com/a/shrub_01 | 灌木组合 |
| Painted wooden bench | https://polyhaven.com/a/painted_wooden_bench | 休憩区长椅 |
| Aerial asphalt 01 | https://polyhaven.com/a/aerial_asphalt_01 | 环路与停车区 PBR |
| Pavement 03 | https://polyhaven.com/a/pavement_03 | 灰色铺装 PBR；运行时 shader 调整颜色并添加板缝 |
| Grass ground | https://polyhaven.com/a/grass_ground | 草地 PBR；运行时 shader 调整为自然绿，保留法线/粗糙度 |
| Grass path 2 | https://polyhaven.com/a/grass_path_2 | 已下载备用，当前主草地不使用 |
| Kloofendal 48d partly cloudy puresky | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | 日光 HDRI 环境 |

## 2026-10-14：圆润绿化与实时优化派生

用户在本轮明确将美术方向调整为明快、圆润的动画风格。

- **Kenney Nature Kit 2.1**：官方来源 [Nature Kit](https://kenney.nl/assets/nature-kit)，下载并核验日期 2026-10-14，CC0 1.0。官方 ZIP 附带许可允许个人、教学、商业项目使用；可改造及网页分发。无针对 AI 工具的额外限制。原文保留在 `asset-sources/kenney-nature/License.txt`，分发副本为 `public/assets/campus/stylized/nature/License-Kenney.txt`。
- `cluster-tree.glb`：源 `tree_detailed.obj`；对原树冠拓扑做两次 Loop 细分、恢复丰满体积、重算平滑法线、重新配色，树干保留。
- `broad-tree.glb`：源 `tree_fat.obj`；同样做树冠圆滑处理。
- `rounded-shrub.glb`：复用 `tree_fat.obj` 原树冠制作低矮灌木，移除树干，拓宽树冠并调整颜色。
- `bench.glb`：Poly Haven Painted wooden bench，CC0；保留原几何，移除扫描贴图，改为暖色哑光材质。
- `optimized/buildings/*.gltf`：获选 Sketchfab 办公楼的实时派生版本；移除室内椅子、合并静态网格，保留楼体外观和入口。玻璃使用透明混合，移除物理折射，日光配色在展示组件应用。沿用 CC BY 4.0、作者与原始来源。
- `optimized/devices/*.gltf`：无人机及原创母车的几何 LOD；保留旋翼、车轮、转向和舱门枢轴。无人机远景合并接近的深色塑料材质；移除镜片物理折射。原无人机 CC BY 4.0、母车 ISC；模型几何及材质均有改造。

当前主场景使用上述圆润绿化与浅色哑光地面；此前下载的 Poly Haven 写实树木、灌木与草地/道路扫描贴图保留为备选，不在默认任务场景加载。详细源文件、哈希、面数与处理记录见 `stylized/nature/assets.json` 和 `optimized/assets.json`。页面中已显示作者、来源、许可与改造说明。
