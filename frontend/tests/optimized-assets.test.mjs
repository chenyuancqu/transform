import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {createDeviceLOD} from '../src/rendering/OptimizedAssetLOD.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),root=path.resolve('public/assets/campus');
const catalog=JSON.parse(await readFile(path.join(root,'optimized/assets.json'),'utf8'));
const nature=JSON.parse(await readFile(path.join(root,'stylized/nature/assets.json'),'utf8'));
const active=catalog.filter(a=>['office','dispatch','mother','matrice-300'].includes(a.id));
const documents=new Map();
for(const a of [...active,...nature])documents.set(a.url,await io.read(path.resolve('public'+a.url)));
function count(doc){let n=0;doc.getRoot().getDefaultScene().traverse(node=>{for(const p of node.getMesh()?.listPrimitives()||[])n+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;});return n;}
test('active GLTF/GLB resources resolve and every index is valid',()=>{
  for(const a of [...active,...nature]){
    const doc=documents.get(a.url);assert.equal(count(doc),a.triangles,a.id+'/'+a.lod);
    for(const m of doc.getRoot().listMaterials())assert.equal(m.getExtension('KHR_materials_transmission'),null,'Scene-wide physical refraction must not return');
    for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
      assert.ok(p.getAttribute('NORMAL'));const pos=p.getAttribute('POSITION');assert.ok(pos.getArray().every(Number.isFinite));
      assert.ok(p.getIndices().getArray().every(i=>i>=0&&i<pos.getCount()),a.url);
    }
  }
});
test('office exterior bounds stay fixed and expensive interior chairs are removed',async()=>{
  for(const id of ['office','dispatch']){
    const a=active.find(a=>a.id===id),source=await io.read(path.join(root,a.source)),doc=documents.get(a.url),before=getBounds(source.getRoot().getDefaultScene()),after=getBounds(doc.getRoot().getDefaultScene());
    for(const key of ['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(before[key][i]-after[key][i])<.001);
    assert.ok(a.removedInterior.length>0);assert.ok(!doc.getRoot().listNodes().some(n=>/office_chairs/i.test(n.getName())));
    assert.ok(count(doc)<count(source)*.05);
  }
});
test('every device LOD preserves the animated pivots and their world transforms',async()=>{
  for(const id of ['mother','matrice-300']){
    const levels=active.filter(a=>a.id===id),source=await io.read(path.join(root,levels[0].source));
    const names=id==='mother'?['wheel_fl','wheel_fr','wheel_rl','wheel_rr','steering_fl','steering_fr','roof_hatch_pivot']:['rotor_1','rotor_2','rotor_3','rotor_4'];
    for(const a of levels)for(const name of names){
      const pivot=documents.get(a.url).getRoot().listNodes().find(n=>n.getName()===name),original=source.getRoot().listNodes().find(n=>n.getName()===name);assert.ok(pivot,name);
      const matrix=pivot.getWorldMatrix(),expected=original.getWorldMatrix();matrix.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-5,name+'/'+a.lod));
    }
    const byLOD=['near','medium','far'].map(lod=>levels.find(a=>a.lod===lod)).filter(Boolean);for(let i=1;i<byLOD.length;i++)assert.ok(byLOD[i].triangles<byLOD[i-1].triangles);
  }
});
test('device LOD thresholds select one visible model and keep rotor nodes independent',()=>{
  const scenes=[0,1,2].map(i=>{const scene=new THREE.Group();scene.name='level-'+i;for(let r=1;r<=4;r++){const rotor=new THREE.Group();rotor.name='rotor_'+r;scene.add(rotor);}return scene;});
  const lod=createDeviceLOD(scenes,[0,22,75]),camera=new THREE.PerspectiveCamera();lod.updateMatrixWorld(true);
  for(const [distance,expected] of [[10,0],[50,1],[130,2]]){camera.position.set(0,0,distance);camera.updateMatrixWorld(true);lod.update(camera);assert.equal(lod.levels.filter(l=>l.object.visible).length,1);assert.equal(lod.getCurrentLevel(),expected);}
  lod.levels[0].object.getObjectByName('rotor_1').rotation.y=1;assert.equal(lod.levels[0].object.rotation.y,0);assert.equal(scenes[0].getObjectByName('rotor_1').rotation.y,0);
});
test('rounded vegetation is opaque, small, and sourced from licensed files',()=>{
  for(const a of nature){assert.equal(a.license,'CC0-1.0');assert.ok(a.bytes<150000);assert.ok(a.source.startsWith('https://'));const doc=documents.get(a.url);assert.equal(doc.getRoot().listTextures().length,0);for(const m of doc.getRoot().listMaterials())assert.equal(m.getAlphaMode(),'OPAQUE');}
  assert.ok(nature.find(a=>a.id==='cluster-tree').triangles<5000);
});
test('full-campus geometry budget including all near devices is below one million triangles',async()=>{
  const get=(id,lod)=>active.find(a=>a.id===id&&a.lod===lod).triangles,plant=id=>nature.find(a=>a.id===id).triangles;
  const buildings=get('office','exterior')*6+get('dispatch','exterior')+4282*7;
  const plants=plant('cluster-tree')*32+plant('broad-tree')*16+plant('rounded-shrub')*64+plant('bench')*8;
  const nearDevices=get('mother','near')+get('matrice-300','near')*3;
  const farDevices=get('mother','medium')+get('matrice-300','far')*3;
  const auxiliaryAllowance=25000;assert.ok(buildings+plants+nearDevices+auxiliaryAllowance<1000000);
  const resources=new Set();
  for(const a of [...active,...nature]){const file=path.resolve('public'+a.url);resources.add(file);if(a.url.endsWith('.gltf')){const json=JSON.parse(await readFile(file,'utf8'));for(const item of [...(json.buffers||[]),...(json.images||[])])if(item.uri&&!item.uri.startsWith('data:'))resources.add(path.resolve(path.dirname(file),item.uri));}}
  resources.add(path.join(root,'environment/kloofendal_48d_partly_cloudy_puresky/sky.hdr'));
  let bytes=0;for(const file of resources)bytes+=(await stat(file)).size;
  const result={buildings,plants,nearDevices,farDevices,auxiliaryAllowance,allNearBudget:buildings+plants+nearDevices+auxiliaryAllowance,farBudget:buildings+plants+farDevices+auxiliaryAllowance,activeAssetFiles:resources.size,activeAssetBytes:bytes,resources:[...resources].map(p=>path.relative(path.resolve('public'),p).replaceAll('\\','/'))};
  await mkdir('output/rtx3060-20261014',{recursive:true});await writeFile('output/rtx3060-20261014/asset-budget.json',JSON.stringify(result,null,2));
});
