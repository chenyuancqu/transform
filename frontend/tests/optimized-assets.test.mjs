import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createDeviceLOD} from '../src/rendering/OptimizedAssetLOD.js';
import {BALCONY_FLOORS,CAMPUS_BUILDINGS,CAMPUS_TREES,GARDENS,LOW_GARDENS,DISTRICT_TREES} from '../src/rendering/campusScenePlan.js';
import {DISTRICT_LAYOUT} from '../src/rendering/districtScenePlan.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),root=path.resolve('public/assets/campus');
const catalog=JSON.parse(await readFile(path.join(root,'optimized/assets.json'),'utf8'));
const nature=JSON.parse(await readFile(path.join(root,'stylized/nature/assets.json'),'utf8'));
const active=catalog.filter(a=>['office','dispatch','mother','matrice-300','context-office'].includes(a.id));
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
test('full-campus geometry budget includes balconies and stays close to one million triangles',async()=>{
  const get=(id,lod)=>active.find(a=>a.id===id&&a.lod===lod).triangles,plant=id=>nature.find(a=>a.id===id).triangles;
  // Decorative geometry is a conservative allowance; district asset instances
  // and vegetation counts come from the same plans used by the actual scene.
  const buildings=get('office','exterior')*6+get('dispatch','exterior')+3500*7;
  const districtBuildings=get('context-office','district')*DISTRICT_LAYOUT.buildings.length;
  const plants=plant('cluster-tree')*CAMPUS_TREES.filter((_,i)=>i%2===0).length+plant('broad-tree')*(CAMPUS_TREES.filter((_,i)=>i%2!==0).length+DISTRICT_TREES.length)+plant('rounded-shrub')*(GARDENS.length+LOW_GARDENS.length)*16+plant('bench')*GARDENS.length*2;
  const nearDevices=get('mother','near')+get('matrice-300','near')*3;
  const farDevices=get('mother','medium')+get('matrice-300','far')*3;
  const balconyCount=CAMPUS_BUILDINGS.filter(b=>(b.height??32)>=20).length*BALCONY_FLOORS.length;
  const detailGeometry={deck:new RoundedBoxGeometry(14.4,.3,3.6,1,.07),glassFront:new THREE.BoxGeometry(13.35,1.02,.09),glassSide:new THREE.BoxGeometry(3.35,1.02,.09),railFront:new THREE.BoxGeometry(14.25,.09,.11),railSide:new THREE.BoxGeometry(3.6,.09,.11),post:new THREE.BoxGeometry(.11,1.2,.11),support:new THREE.BoxGeometry(.16,.62,.18),planter:new RoundedBoxGeometry(1.55,.58,.76,1,.06),foliage:new THREE.SphereGeometry(1,8,5),signal:new THREE.BoxGeometry(12.6,.045,.045)};
  const instances={deck:balconyCount,glassFront:balconyCount,glassSide:balconyCount*2,railFront:balconyCount*2,railSide:balconyCount*4,post:balconyCount*5,support:balconyCount*2,planter:balconyCount*2,foliage:balconyCount*6,signal:balconyCount};
  const balconyDetails=Object.entries(instances).reduce((total,[name,count])=>total+(detailGeometry[name].index?.count??detailGeometry[name].attributes.position.count)/3*count,0);
  Object.values(detailGeometry).forEach(geometry=>geometry.dispose());
  const auxiliaryAllowance=25000,allNearBudget=buildings+districtBuildings+plants+nearDevices+auxiliaryAllowance+balconyDetails;
  assert.ok(allNearBudget<1020000,`all-near scene budget ${allNearBudget} exceeds the 1.02m target`);
  const resources=new Set();
  for(const a of [...active,...nature]){const file=path.resolve('public'+a.url);resources.add(file);if(a.url.endsWith('.gltf')){const json=JSON.parse(await readFile(file,'utf8'));for(const item of [...(json.buffers||[]),...(json.images||[])])if(item.uri&&!item.uri.startsWith('data:'))resources.add(path.resolve(path.dirname(file),item.uri));}}
  resources.add(path.join(root,'environment/qwantani_noon_puresky/sky.hdr'));
  let bytes=0;for(const file of resources)bytes+=(await stat(file)).size;
  const result={buildings,districtBuildings,plants,nearDevices,farDevices,balconyDetails,auxiliaryAllowance,allNearBudget,farBudget:buildings+districtBuildings+plants+farDevices+auxiliaryAllowance+balconyDetails,activeAssetFiles:resources.size,activeAssetBytes:bytes,resources:[...resources].map(p=>path.relative(path.resolve('public'),p).replaceAll('\\','/'))};
  await mkdir('output/rtx3060-20261014',{recursive:true});await writeFile('output/rtx3060-20261014/asset-budget.json',JSON.stringify(result,null,2));
});
