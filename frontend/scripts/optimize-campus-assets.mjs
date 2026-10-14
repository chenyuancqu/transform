// Offline derivatives of the approved licensed assets. Originals are never overwritten.
import {NodeIO,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,prune,dedup,flatten,join,compactPrimitive,getBounds,cloneDocument} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('public/assets/campus'),out=path.join(root,'optimized');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
await mkdir(out,{recursive:true});
const report=[];
const primitiveTriangles=p=>(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
// Count scene instances too (four wheels may refer to one shared mesh).
const triangles=doc=>{let count=0;(doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0]).traverse(n=>{if(n.getMesh())for(const p of n.getMesh().listPrimitives())count+=primitiveTriangles(p);});return count;};
const assetBounds=doc=>getBounds(doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0]);

function simplifyPrimitive(doc,p,ratio,error,minimum=24){
  const positions=p.getAttribute('POSITION');if(p.getMode()!==4||primitiveTriangles(p)<=minimum)return {error:0};
  const indices=new Uint32Array(p.getIndices().getArray()),pos=positions.getArray();
  const attrs=['NORMAL','TEXCOORD_0'].map(k=>p.getAttribute(k)).filter(Boolean);
  const stride=attrs.reduce((n,a)=>n+a.getElementSize(),0),attributes=new Float32Array(positions.getCount()*stride),weights=[];
  let offset=0;
  for(const a of attrs){const width=a.getElementSize(),values=a.getArray();for(let i=0;i<positions.getCount();i++)for(let j=0;j<width;j++)attributes[i*stride+offset+j]=values[i*width+j];for(let j=0;j<width;j++)weights.push(width===3?.04:.12);offset+=width;}
  // Retain the source extremities so changing LOD does not resize or re-centre the device.
  const locks=new Uint8Array(positions.getCount());
  for(let axis=0;axis<3;axis++){let lo=0,hi=0;for(let i=1;i<positions.getCount();i++){if(pos[i*3+axis]<pos[lo*3+axis])lo=i;if(pos[i*3+axis]>pos[hi*3+axis])hi=i;}locks[lo]=locks[hi]=1;}
  const target=Math.max(minimum*3,Math.floor(indices.length*ratio/3)*3);
  const [reduced,actualError]=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attributes,stride,weights,locks,target,error,/leaves|shrub/i.test(p.getMaterial()?.getName()||'')?[]:['Permissive','Prune']);
  if(!reduced.length)return {error:0,preserved:true};
  assert.ok(reduced.length%3===0);
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(reduced).setBuffer(positions.getBuffer()));
  compactPrimitive(p);
  return {error:actualError};
}

async function writeShared(doc,relative,record){
  // All LODs refer to the same image URLs rather than embedding another atlas per LOD.
  for(const texture of doc.getRoot().listTextures()){
    const bytes=texture.getImage();if(!bytes)continue;
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,20);
    const ext=texture.getMimeType()==='image/png'?'png':'jpg';
    texture.setURI(`../textures/${hash}.${ext}`);
  }
  await doc.transform(prune({keepLeaves:true}),dedup());
  const filename=path.join(out,relative);await mkdir(path.dirname(filename),{recursive:true});
  doc.getRoot().listBuffers().forEach((buffer,i)=>buffer.setURI(path.basename(relative,'.gltf')+'-'+i+'.bin'));
  const {json,resources}=await io.writeJSON(doc);
  let bytes=0,geometryBytes=0;
  for(const [uri,data] of Object.entries(resources)){
    const target=path.resolve(path.dirname(filename),uri);
    assert.ok(target.startsWith(out+path.sep),'Resource escaped optimization output');
    await mkdir(path.dirname(target),{recursive:true});
    let exists=false;try{exists=Buffer.from(await readFile(target)).equals(Buffer.from(data));}catch{}
    if(!exists)await writeFile(target,data);
    bytes+=data.byteLength;if(uri.endsWith('.bin'))geometryBytes+=data.byteLength;
  }
  const text=JSON.stringify(json);await writeFile(filename,text);
  let scenePrimitives=0;doc.getRoot().getDefaultScene().traverse(n=>{scenePrimitives+=n.getMesh()?.listPrimitives().length||0;});
  const result={...record,url:'/assets/campus/optimized/'+relative.replaceAll('\\','/'),triangles:triangles(doc),bounds:assetBounds(doc),primitives:scenePrimitives,geometryBytes,resourceBytes:bytes+Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
  report.push(result);
  let catalog=[];try{catalog=JSON.parse(await readFile(path.join(out,'assets.json'),'utf8'));}catch{}
  await writeFile(path.join(out,'assets.json'),JSON.stringify([...catalog.filter(a=>a.id!==result.id||a.lod!==result.lod),result],null,2));
  console.log(JSON.stringify({id:result.id,lod:result.lod,triangles:result.triangles,primitives:result.primitives,geometryBytes}));
}

async function building(id,source){
  const doc=await io.read(path.join(root,source));doc.setLogger(new Logger(Logger.Verbosity.WARN));const before=triangles(doc),removed=[];
  for(const node of doc.getRoot().listNodes()){
    if(node.getMesh()&&/office_chairs/i.test(node.getName()+' '+node.getMesh().getName())){removed.push({name:node.getName(),triangles:node.getMesh().listPrimitives().reduce((n,p)=>n+primitiveTriangles(p),0)});node.dispose();}
  }
  await doc.transform(prune(),dedup());
  // Keep the approved glazing appearance; furniture is physically removed.
  // The renderer uses a single pass for double-sided transparency.
  // Stylized glass uses alpha transparency; physical refraction renders the
  // whole opaque scene into another framebuffer and darkens these facades.
  for(const material of doc.getRoot().listMaterials())if(material.getName()==='glass')material.setExtension('KHR_materials_transmission',null).setAlphaMode('BLEND').setBaseColorFactor([.32,.46,.50,.43]).setRoughnessFactor(.21);
  await doc.transform(flatten(),join({keepNamed:false}),weld(),prune());
  await writeShared(doc,`buildings/${id}.gltf`,{id,lod:'exterior',source,sourceTriangles:before,removedInterior:removed,license:'CC BY 4.0'});
}

async function lodAsset(id,source,levels,device=false){
  const base=await io.read(path.join(root,source));base.setLogger(new Logger(Logger.Verbosity.WARN));
  const before=triangles(base),boundsBefore=assetBounds(base);
  for(const material of base.getRoot().listMaterials())material.setExtension('KHR_materials_transmission',null);
  for(const mesh of base.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    p.setAttribute('COLOR_1',null);
    const colour=p.getAttribute('COLOR_0');if(colour){const a=colour.getArray(),white=colour.getComponentType()===5121?255:1;if(a.every(x=>x===white))p.setAttribute('COLOR_0',null);}
  }
  await base.transform(weld(),dedup());
  for(const [lod,ratio,error] of levels){
    const doc=cloneDocument(base);let maxError=0;const simplifiedMeshes=new Set();
    for(const node of doc.getRoot().listNodes()){
      const mesh=node.getMesh();if(!mesh||simplifiedMeshes.has(mesh))continue;simplifiedMeshes.add(mesh);
      let ancestor=node,rotor=false;while(ancestor?.propertyType==='Node'){if(/^rotor_[1-4]$/.test(ancestor.getName()))rotor=true;ancestor=ancestor.getParentNode();}
      for(const p of mesh.listPrimitives())if(!rotor)maxError=Math.max(maxError,simplifyPrimitive(doc,p,ratio,error,device?48:12).error);
    }
    // At >75 metres, minute differences between dark plastic shades cost
    // separate draw calls but occupy only a few pixels. Near/medium retain all
    // source materials; coloured LEDs, metal and transparent lenses stay intact.
    if(id==='matrice-300'&&lod==='far'){
      const palette=new Map();
      for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
        const m=p.getMaterial(),c=m?.getBaseColorFactor();
        if(!m||m.getAlphaMode()!=='OPAQUE'||m.getMetallicFactor()>.2||m.getBaseColorTexture()||Math.max(...c.slice(0,3))>.18)continue;
        const key=Math.max(...c.slice(0,3))<.095?'dark-plastic':'light-plastic';
        if(!palette.has(key))palette.set(key,doc.createMaterial('far-'+key).setBaseColorFactor(key==='dark-plastic'?[.055,.058,.064,1]:[.13,.14,.14,1]).setMetallicFactor(0).setRoughnessFactor(.6).setDoubleSided(m.getDoubleSided()));
        p.setMaterial(palette.get(key));
      }
    }
    await doc.transform(prune({keepLeaves:true}),dedup());
    if(!device)await doc.transform(flatten(),join({keepNamed:false}));
    else await doc.transform(join({keepNamed:false,filter:n=>!(/^(rotor_[1-4]|wheel_|steering_|roof_hatch_pivot)/.test(n.getName()))}));
    const afterBounds=assetBounds(doc);
    for(const key of ['min','max'])for(let a=0;a<3;a++)assert.ok(Math.abs(afterBounds[key][a]-boundsBefore[key][a])<(device?.025:(boundsBefore.max[a]-boundsBefore.min[a])*.12),JSON.stringify({id,lod,boundsBefore,afterBounds}));
    if(id==='mother')for(const pivot of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr','steering_fl','steering_fr','roof_hatch_pivot'])assert.ok(doc.getRoot().listNodes().some(n=>n.getName()===pivot),'Mother pivot lost: '+pivot);
    if(id==='matrice-300')for(let i=1;i<=4;i++)assert.ok(doc.getRoot().listNodes().some(n=>n.getName()==='rotor_'+i),'Rotor pivot lost');
    await writeShared(doc,`${device?'devices':'nature'}/${id}-${lod}.gltf`,{id,lod,source,sourceTriangles:before,sourceBounds:boundsBefore,errorLimit:error,maxRelativeError:maxError,materialSimplified:id==='matrice-300'&&lod==='far',license:device?(id==='mother'?'ISC':'CC BY 4.0'):'CC0-1.0'});
  }
}

const requested=process.argv.slice(2);
const enabled=id=>!requested.length||requested.includes(id);
if(enabled('office'))await building('office','buildings/glass-office/daylight-ready.glb');
if(enabled('dispatch'))await building('dispatch','buildings/glass-office/dispatch-centre.glb');
if(enabled('island_tree_02'))await lodAsset('island_tree_02','models/island_tree_02/island_tree_02_2k.gltf',[['near',.04,.02],['medium',.036,.025],['far',.032,.025]]);
if(enabled('jacaranda_tree'))await lodAsset('jacaranda_tree','models/jacaranda_tree/jacaranda_tree_2k.gltf',[['near',.015,.025],['medium',.010,.035],['far',.006,.055]]);
if(enabled('shrub_01'))await lodAsset('shrub_01','models/shrub_01/shrub_01_2k.gltf',[['near',.025,.025],['medium',.009,.055],['far',.004,.10]]);
if(enabled('matrice-300'))await lodAsset('matrice-300','drones/matrice-300/flight-ready.glb',[['near',.16,.004],['medium',.045,.008],['far',.018,.016]],true);
if(enabled('mother'))await lodAsset('mother','vehicles/mother-carrier-original.glb',[['near',1,0],['medium',.3,.005]],true);
const manifest=path.join(out,'assets.json');let previous=[];try{previous=JSON.parse(await readFile(manifest,'utf8'));}catch{}
const keys=new Set(report.map(a=>a.id+'/'+a.lod));
await writeFile(manifest,JSON.stringify([...previous.filter(a=>!keys.has(a.id+'/'+a.lod)),...report],null,2));
