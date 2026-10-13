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
