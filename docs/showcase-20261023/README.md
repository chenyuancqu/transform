# NEXUS 展示材料

基于 `frontend-showcase-20261014V2` 的 `f3b5bc9`，整理日期 2026-10-23。

## 交付文件

1. `output/pdf/01_录屏操作与旁白脚本.pdf`：4 页，含启动准备、约 5 分钟分镜、可复制的自然语言指令、长素材录制与发布口径。
2. `output/pdf/02_系统说明与价值评估.pdf`：4 页，含背景、痛点、方案、可行性、价值和下一步。
3. `output/showcase-20261023/03_作品图_4比3.png`：1448×1086，紫白色 4:3 横版作品图。主视觉为 AI 生成的概念示意，不是系统实机或网页截图，内部订单标签仅用于构图。
4. `output/pdf/04_系统技术文档_双栏.pdf`：7 页，五章结构，含架构、状态机、网络、真实训练曲线、独立测试和消融图表。

本目录的 `.md` 是可编辑正文，`content.py` 是排版用结构化稿件，`build_materials.py` 可在原仓库重新生成三个 PDF 与图表。图表素材在 `output/showcase-20261023/figures/`，同时保存 PNG 和 PDF 格式。

## 口径和数据来源

- 性能改善来自 512 个独立静态场景，相对“时间/能耗规则选单 + 中心接应母车”基线。
- 平均时延改善 1.72%，每单 UAV 能耗改善 2.29%，总 UAV 能耗改善 2.41%，综合目标改善 1.92%。总能耗与每单能耗不要混写。
- 动态 30 单证明在线执行闭环已跑通，不用于证明动态场景优于规则。
- 消融没有证明学习选单的额外收益，当前主要收益来自学习母车接应。
- 当前未计母车能耗、未接入实机；订单完成指回收至母车卸货完成。

原始依据：

- `experiments/dispatch_v2/results/summary.json`、`selection.json`。
- `experiments/dispatch_v2/runs/ppo_wave_sync_seed7/learning.csv` 与 seed42 同名文件。
- `frontend/output/v2-integration/mqtt-acceptance.json` 与 `ai-live-acceptance.json`。
- 当前前后端代码及 `frontend/docs/v2-integration.md`。

相关工作使用原作者/会议页面及原始论文核对：Murray 与 Chu (2015)，PPO (2017)，Deep Sets (2017)，Yang 与 Fan 的 MA-FSTSP (AAAI 2026)。参考资料链接见技术文档正文。

## 再生成

在仓库根目录使用装有 `reportlab==4.2.5`、`matplotlib`、`Pillow`、`pypdf` 的 Python 执行：

```powershell
python docs/showcase-20261023/build_materials.py
```

脚本使用 Windows 微软雅黑字体，输出中文嵌入字体 PDF。再生成不访问模型 API，也不修改运行服务。

作品图使用内置 `image_gen` 生成，完整提示词保存在 `poster-prompt.txt`。提示词以“一个移动母车与三架无人机的园区取件闭环”为主视觉，指定紫白配色、4:3 横幅和经过限定的结果文字；未将科学数据图交给图像模型绘制。

展示材料的准备不改变模型、前后端代码或本机密钥配置。
