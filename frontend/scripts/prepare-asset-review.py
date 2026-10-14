"""Prepare a local shortlist using verified public Sketchfab metadata and previews."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/campus/review'
OUT.mkdir(parents=True, exist_ok=True)
SELECTED = [
    ('8d3ea98595b4403cbf21065e8f9b7bb7', '建筑候选 · 写实立面', '伦敦办公楼',
     '原作者近景可见石材接缝、玻璃分格、入口台阶与金属扶手，建筑具有真实尺度参照。',
     '需要取得模型，检查完整体量、背面、玻璃与材质贴图。'),
    ('af9782245c134c21ae0c8df7f57077e6', '建筑候选 · 内部细节', '玻璃幕墙办公楼',
     '完整玻璃幕墙与内部办公设施。原作者使用暗光预览，项目中的场景仍采用白天日光。',
     '需确认室内灯光是否烘焙，能否在白天自然呈现，以及楼层和占地尺寸。'),
    ('6677d02d66df4b73aad0d8e7bb9e3d9c', '无人机候选 · 工业机型', 'DJI Matrice 300 RTK',
     '机臂关节、电机、传感器、起落架和云台细节丰富，按工业四旋翼形态建模。',
     '需拆分旋翼、移除展示箱，设计可视化载货机构；这是工业机型外观基底，并非现成物流机。'),
    ('6f952a34d1f44905af42c803cba2805f', '母车外形基底 · 物流车', 'Nissan NV200 配送货车',
     '真实货车的车身曲面、灯组、货舱门和轮毂细节，适合后续设计移动物流母车。',
     '原模型为 DHL 涂装的普通货车，需检查贴图、去除品牌涂装，并设计传感器及接货接口。'),
    ('d499b10731194ae0b122a76e099eb2b5', '母车外形基底 · 现代车身', 'Hyundai Staria',
     '现代车身曲面、完整轮毂与灯组、通透车窗和内部结构，提供另一种母车造型方向。',
     '原模型是客车，尚非无人物流母车；需验证可改造性、车轮节点和货舱空间。'),
]
assets = []
for uid, category, title, advantages, pending in SELECTED:
    model = json.loads((ROOT / f'output/backend/model-{uid}.json').read_text(encoding='utf-8'))
    assert model['isDownloadable'] and model['license']['label'] == 'CC Attribution'
    assert not any(t.get('name', '').lower() == 'noai' for t in model.get('tags', []))
    shutil.copyfile(ROOT / f'output/backend/model-{uid}.jpg', OUT / f'{uid}.jpg')
    assets.append(dict(uid=uid, category=category, title=title, originalTitle=model['name'],
                       author=model['user']['displayName'], source=model['viewerUrl'],
                       license=model['license']['label'], licenseUrl=model['license']['url'],
                       triangles=model['faceCount'], animationCount=model.get('animationCount', 0),
                       preview=f'/assets/campus/review/{uid}.jpg', advantages=advantages, pending=pending,
                       stage='preview-reviewed; model-file-not-downloaded', checkedAt='2026-10-13'))
(OUT / 'shortlist.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Prepared {len(assets)} new candidates. Previous batch rejected. Model files are NOT downloaded or accepted.')
