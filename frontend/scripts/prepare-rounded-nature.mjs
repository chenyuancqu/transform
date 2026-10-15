// CC0 Kenney Nature Kit derivatives. Smooth the authored canopy topology,
// keep its branching silhouette, then export small real GLB assets.
import {Document,NodeIO} from '@gltf-transform/core';
import {prune,dedup} from '@gltf-transform/functions';
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
const input='asset-sources/kenney-nature',out='public/assets/campus/stylized/nature';
await mkdir(out,{recursive:true});
const source='https://kenney.nl/assets/nature-kit';
const sum=(a,b)=>a.map((x,i)=>x+b[i]),scale=(v,s)=>v.map(x=>x*s);
function restoreCanopyVolume(shape,original,isShrub){
  const adjacent=shape.vertices.map(()=>new Set());for(const face of shape.faces)for(const a of face)for(const b of face)adjacent[a].add(b);
  const seen=new Set(),bounds=points=>({min:[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...points.map(p=>p[a])))});
  for(let i=0;i<shape.vertices.length;i++){
    if(seen.has(i))continue;const component=[],queue=[i];seen.add(i);
    while(queue.length){const n=queue.pop();component.push(n);for(const neighbor of adjacent[n])if(!seen.has(neighbor)){seen.add(neighbor);queue.push(neighbor);}}
    const sourcePoints=component.filter(n=>n<original.length).map(n=>original[n]);if(!sourcePoints.length)continue;
    const before=bounds(sourcePoints),after=bounds(component.map(n=>shape.vertices[n]));
    for(const n of component)for(let a=0;a<3;a++){const width=after.max[a]-after.min[a];if(width<1e-7)continue;const expansion=a===1?1.04:(isShrub?1.6:1.22);shape.vertices[n][a]=(before.min[a]+before.max[a])/2+(shape.vertices[n][a]-(after.min[a]+after.max[a])/2)*(before.max[a]-before.min[a])/width*expansion;}
  }
  return shape;
}
function loop(vertices,faces){
  const edges=new Map(),neighbors=vertices.map(()=>new Set());
  for(const [a,b,c] of faces)for(const [x,y,z] of [[a,b,c],[b,c,a],[c,a,b]]){neighbors[x].add(y);neighbors[y].add(x);const k=[x,y].sort((p,q)=>p-q).join(':');if(!edges.has(k))edges.set(k,{a:x,b:y,opposite:[]});edges.get(k).opposite.push(z);}
  const boundary=vertices.map(()=>[]);for(const e of edges.values())if(e.opposite.length===1){boundary[e.a].push(e.b);boundary[e.b].push(e.a);}
  const result=vertices.map((p,i)=>{if(boundary[i].length===2)return sum(scale(p,.75),scale(sum(vertices[boundary[i][0]],vertices[boundary[i][1]]),.125));const n=neighbors[i].size;if(!n)return p;const beta=n===3?3/16:3/(8*n);return [...neighbors[i]].reduce((v,j)=>sum(v,scale(vertices[j],beta)),scale(p,1-n*beta));});
  for(const e of edges.values()){e.index=result.length;result.push(e.opposite.length===2?sum(scale(sum(vertices[e.a],vertices[e.b]),.375),scale(sum(vertices[e.opposite[0]],vertices[e.opposite[1]]),.125)):scale(sum(vertices[e.a],vertices[e.b]),.5));}
  const edge=(a,b)=>edges.get([a,b].sort((p,q)=>p-q).join(':')).index;
  return {vertices:result,faces:faces.flatMap(([a,b,c])=>{const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a);return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]];})};
}
const manifest=[];
for(const [id,file] of [['cluster-tree','tree_detailed'],['broad-tree','tree_fat'],['rounded-shrub','tree_fat']]){
  const text=await readFile(`${input}/${file}.obj`,'utf8'),positions=[],groups=new Map();let current='';
  for(const line of text.split(/\r?\n/)){const [type,...values]=line.trim().split(/\s+/);if(type==='v')positions.push(values.map(Number));else if(type==='usemtl'){current=values.join(' ');if(!groups.has(current))groups.set(current,[]);}else if(type==='f'){const ids=values.map(v=>Number(v.split('/')[0])-1);for(let i=1;i<ids.length-1;i++)groups.get(current).push([ids[0],ids[i],ids[i+1]]);}}
  const doc=new Document(),scene=doc.createScene('Kenney rounded campus nature'),buffer=doc.createBuffer(),parts=[];doc.getRoot().setDefaultScene(scene);let triangles=0;
  for(const [name,original] of groups){
    const leaves=/leaf|green|grass/i.test(name);if(name==='_defaultMat'||(id==='rounded-shrub'&&!leaves))continue;
    const indices=new Map(),welded=new Map(),vertices=[],faces=original.map(face=>face.map(i=>{if(indices.has(i))return indices.get(i);const p=positions[i],key=p.map(x=>x.toFixed(6)).join(':');if(!welded.has(key)){welded.set(key,vertices.length);vertices.push(p);}indices.set(i,welded.get(key));return indices.get(i);}));
    let shape={vertices,faces};if(leaves){for(let i=0;i<(id==='broad-tree'?2:1);i++)shape=loop(shape.vertices,shape.faces);restoreCanopyVolume(shape,vertices,id==='rounded-shrub');}
    const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(shape.vertices.flat(),3)).setIndex(shape.faces.flat());geometry.computeVertexNormals();
    const material=doc.createMaterial(leaves?'canopy-green':'warm-bark').setBaseColorFactor(new THREE.Color(leaves?'#6fae67':'#b78762').toArray().concat(1)).setMetallicFactor(0).setRoughnessFactor(.92);
    const attr=(name,type,array)=>doc.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
    const primitive=doc.createPrimitive().setAttribute('POSITION',attr('position','VEC3',geometry.attributes.position.array)).setAttribute('NORMAL',attr('normal','VEC3',geometry.attributes.normal.array)).setIndices(attr('indices','SCALAR',new Uint32Array(shape.faces.flat()))).setMaterial(material);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));triangles+=shape.faces.length;parts.push({name,triangles:shape.faces.length});geometry.dispose();
  }
  const bytes=await new NodeIO().writeBinary(doc);await writeFile(`${out}/${id}.glb`,bytes);
  manifest.push({id,url:`/assets/campus/stylized/nature/${id}.glb`,source,author:'Kenney',sourceFile:file+'.obj',license:'CC0-1.0',modification:`${id==='broad-tree'?'Two':'One'} Loop subdivision passes on original canopy topology, restored fuller crown volumes, recomputed smooth normals; original trunk retained for trees, canopy reused for shrubs.`,triangles,parts,bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await copyFile(`${input}/License.txt`,`${out}/License-Kenney.txt`);
const bench=await new NodeIO().read('public/assets/campus/models/painted_wooden_bench/painted_wooden_bench_2k.gltf');
for(const material of bench.getRoot().listMaterials()){
  material.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
  material.setBaseColorFactor(new THREE.Color('#bc926d').toArray().concat(1)).setMetallicFactor(.1).setRoughnessFactor(.8);
}
await bench.transform(prune(),dedup());const benchBytes=await new NodeIO().writeBinary(bench);await writeFile(`${out}/bench.glb`,benchBytes);
manifest.push({id:'bench',url:'/assets/campus/stylized/nature/bench.glb',source:'https://polyhaven.com/a/painted_wooden_bench',author:'Poly Haven',license:'CC0-1.0',modification:'Original geometry, replaced scanned texture maps with warm matte colour.',triangles:630,bytes:benchBytes.byteLength});
await writeFile(`${out}/assets.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
