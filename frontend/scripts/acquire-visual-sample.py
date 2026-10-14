"""Fetch selected CC0 environment assets; verify published hashes, never credentials."""
import asyncio
import hashlib
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/campus'
MODELS = ['island_tree_02', 'jacaranda_tree', 'shrub_01', 'painted_wooden_bench']
MATERIALS = ['aerial_asphalt_01', 'pavement_03', 'grass_path_2', 'grass_ground']


async def main():
    sem = asyncio.Semaphore(5)
    catalog = []
    previous = {a['id']: a for a in json.loads((DEST/'environment-assets.json').read_text())} if (DEST/'environment-assets.json').exists() else {}
    async with httpx.AsyncClient(proxy='http://127.0.0.1:7897', trust_env=False,
                                follow_redirects=True, timeout=90) as client:
        async def download(info, path):
            if path.exists() and hashlib.md5(path.read_bytes()).hexdigest() == info['md5']:
                return
            async with sem:
                response = await client.get(info['url'])
                response.raise_for_status()
                if hashlib.md5(response.content).hexdigest() != info['md5']:
                    raise ValueError(f'Hash mismatch: {path.name}')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(response.content)

        async def asset(name, kind):
            response = await client.get('https://api.polyhaven.com/files/' + name)
            response.raise_for_status()
            files = response.json()
            target = DEST / kind / name
            selected = []
            if kind == 'models':
                model = files['gltf']['2k']['gltf']
                selected = [(model, target / (name + '_2k.gltf'))]
                selected += [(f, target / p) for p, f in model.get('include', {}).items()]
                for channel in ['leaves_alpha','alpha']:
                    if channel in files and 'png' in files[channel].get('2k',{}):
                        selected.append((files[channel]['2k']['png'],target/(channel+'_2k.png')))
            elif kind == 'materials':
                for channel in ['Diffuse', 'nor_gl', 'Rough']:
                    selected.append((files[channel]['2k']['jpg'], target / (channel + '.jpg')))
            else:
                selected = [(files['hdri']['2k']['hdr'], target / 'sky.hdr')]
            await asyncio.gather(*(download(f, p) for f, p in selected))
            catalog.append(dict(id=name, kind=kind, source='https://polyhaven.com/a/' + name,
                                license='CC0-1.0', licenseUrl='https://polyhaven.com/license',
                                downloaded=previous.get(name, {}).get('downloaded','2026-10-14'),
                                verifiedAt='2026-10-14',
                                files=[dict(path=str(p.relative_to(ROOT)).replace('\\', '/'),
                                            bytes=p.stat().st_size, md5=f['md5']) for f, p in selected]))
            print('Verified:', name, sum(p.stat().st_size for _, p in selected), 'bytes', flush=True)

        await asyncio.gather(*(asset(n, 'models') for n in MODELS),
                             *(asset(n, 'materials') for n in MATERIALS),
                             asset('kloofendal_48d_partly_cloudy_puresky', 'environment'))
    (DEST / 'environment-assets.json').write_text(json.dumps(catalog, indent=2), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
