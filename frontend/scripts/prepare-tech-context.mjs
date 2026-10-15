// Reuse the approved CC BY office exterior for the surrounding district.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {simplify,prune,dedup,getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readFile,writeFile,stat} from 'node:fs/promises';
const root='public/assets/campus',io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const doc=await io.read(root+'/optimized/buildings/office.gltf');
const before=getBounds(doc.getRoot().getDefaultScene());
// Distant mullion grids are sub-pixel; retain the facade/glass/roof silhouette.
for(const node of doc.getRoot().listNodes())if(node.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getName()==='rams'))node.dispose();
for(const m of doc.getRoot().listMaterials())m.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null);
await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.1,error:.02,lockBorder:false}),prune(),dedup());
const after=getBounds(doc.getRoot().getDefaultScene());
for(const key of ['min','max'])for(let i=0;i<3;i++)if(Math.abs(before[key][i]-after[key][i])>.05)throw Error('Context simplification changed exterior bounds.');
let triangles=0;doc.getRoot().getDefaultScene().traverse(n=>{for(const p of n.getMesh()?.listPrimitives()||[])triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;});
const url='/assets/campus/optimized/buildings/context-office.gltf';
doc.getRoot().listBuffers().forEach((buffer,i)=>buffer.setURI(`context-office-${i}.bin`));
await io.write('public'+url,doc);
const catalog=JSON.parse(await readFile(root+'/optimized/assets.json','utf8')).filter(a=>a.id!=='context-office');
catalog.push({id:'context-office',lod:'district',source:'optimized/buildings/office.gltf',url,triangles,bounds:after,license:'CC-BY-4.0',author:'Nikitos & 3130',modification:'Approved office exterior simplified for distant instanced district buildings; scanned maps omitted.'});
await writeFile(root+'/optimized/assets.json',JSON.stringify(catalog,null,2));
console.log(JSON.stringify({url,triangles,bytes:(await stat('public'+url)).size,bounds:after}));
