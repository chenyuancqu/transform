import * as THREE from 'three';
import {mergeStaticChildren} from './MergeStaticMeshes.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CAMPUS_ART as A} from './CampusArtDirection.js';

function makeTexture(width,height,paint){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

// Soft, hand-designed reflections and clear solar-cell divisions keep these
// surfaces readable in daylight without relying on noisy photographic maps.
export const OFFICE_GLASS_TEXTURE=makeTexture(512,512,(ctx,w,h)=>{
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#8db1cb');sky.addColorStop(.24,'#628da9');sky.addColorStop(.55,'#3b6788');sky.addColorStop(1,'#294960');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const glow=ctx.createLinearGradient(0,0,w*.8,h);glow.addColorStop(0,'#d9edff55');glow.addColorStop(.32,'#d9edff12');glow.addColorStop(.7,'#d9edff00');glow.addColorStop(1,'#d9edff20');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#e6f3ff20';ctx.beginPath();ctx.moveTo(w*.14,0);ctx.lineTo(w*.35,0);ctx.lineTo(w*.6,h);ctx.lineTo(w*.46,h);ctx.closePath();ctx.fill();
  ctx.fillStyle='#e6f3ff12';ctx.beginPath();ctx.moveTo(w*.7,0);ctx.lineTo(w*.87,0);ctx.lineTo(w,h*.6);ctx.lineTo(w*.83,h*.6);ctx.closePath();ctx.fill();
});
export const OFFICE_NIGHT_GLASS_TEXTURE=makeTexture(512,512,(ctx,w,h)=>{
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#102842');sky.addColorStop(.55,'#0a1d32');sky.addColorStop(1,'#07182b');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const columns=20,rows=11,cw=w/columns,ch=h/rows;
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const seed=(col*37+row*19+col*row*7)%17,lit=seed<3;
    const x=col*cw+2,y=row*ch+2,paneW=cw-4,paneH=ch-4;
    ctx.fillStyle=lit?(seed%3===0?'#b99161':'#d5b47e'):(seed%4===0?'#183b58':'#102b45');
    ctx.fillRect(x,y,paneW,paneH);
    if(lit){ctx.fillStyle='#fff0bd24';ctx.fillRect(x+2,y+2,paneW-4,Math.max(2,paneH*.12));ctx.fillStyle='#13283d55';ctx.fillRect(x+paneW*.72,y+3,2,paneH-6);}
  }
  ctx.strokeStyle='#34526b';ctx.lineWidth=2;
  for(let col=1;col<columns;col++){ctx.beginPath();ctx.moveTo(col*cw,0);ctx.lineTo(col*cw,h);ctx.stroke();}
  for(let row=1;row<rows;row++){ctx.beginPath();ctx.moveTo(0,row*ch);ctx.lineTo(w,row*ch);ctx.stroke();}
});
export const OFFICE_SOLAR_TEXTURE=makeTexture(512,256,(ctx,w,h)=>{
  const base=ctx.createLinearGradient(0,0,w,h);base.addColorStop(0,'#254b6c');base.addColorStop(.5,'#345d7e');base.addColorStop(1,'#1e3f5b');
  ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
  const sheen=ctx.createLinearGradient(0,0,w*.65,h);sheen.addColorStop(0,'#f1f4df28');sheen.addColorStop(.38,'#e9fff10b');sheen.addColorStop(1,'#d6fff000');ctx.fillStyle=sheen;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#9bb7d277';ctx.lineWidth=2;
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*w/5,0);ctx.lineTo(i*w/5,h);ctx.stroke();}
  for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(0,i*h/3);ctx.lineTo(w,i*h/3);ctx.stroke();}
  ctx.strokeStyle='#153144aa';ctx.lineWidth=6;ctx.strokeRect(3,3,w-6,h-6);
});
const CONTEXT_GLASS_TEXTURE=makeTexture(256,256,(ctx,w,h)=>{
  ctx.drawImage(OFFICE_GLASS_TEXTURE.image,0,0,w,h);
  ctx.strokeStyle='#c4dfed66';ctx.lineWidth=1;
  for(let i=1;i<9;i++){ctx.beginPath();ctx.moveTo(0,i*h/9);ctx.lineTo(w,i*h/9);ctx.stroke();}
  for(let i=1;i<7;i++){ctx.beginPath();ctx.moveTo(i*w/7,0);ctx.lineTo(i*w/7,h);ctx.stroke();}
});

// Original architectural additions to the licensed GLB, in physical metres.
// Main structure, facades and interior remain the downloaded model.
export function createOfficeArchitecture(label='NEXUS / INNOVATION',roofHeight=32,nightMode=false) {
  const root=new THREE.Group();root.name='original-office-accents';
  const stone=new THREE.MeshStandardMaterial({color:A.wall,roughness:.84});
  const softTrim=new THREE.MeshStandardMaterial({color:'#e9f0f5',roughness:.8});
  const metal=new THREE.MeshStandardMaterial({color:A.metal,metalness:.18,roughness:.58});
  const glass=new THREE.MeshStandardMaterial({map:nightMode?OFFICE_NIGHT_GLASS_TEXTURE:OFFICE_GLASS_TEXTURE,emissive:nightMode?'#edc78f':'#000000',emissiveMap:nightMode?OFFICE_NIGHT_GLASS_TEXTURE:null,emissiveIntensity:nightMode?.3:0,color:'#ffffff',metalness:.12,roughness:nightMode?.62:.4,envMapIntensity:nightMode?.08:.3});
  const solar=new THREE.MeshStandardMaterial({map:OFFICE_SOLAR_TEXTURE,color:'#ffffff',metalness:.06,roughness:.65});
  const cyan=new THREE.MeshStandardMaterial({color:A.cyan,emissive:A.cyan,emissiveIntensity:.12,roughness:.5});
  const add=(name,size,position,material,parent=root)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const addRounded=(name,size,position,material,radius)=>{const m=new THREE.Mesh((size[1]<.2?new THREE.BoxGeometry(...size):new RoundedBoxGeometry(...size,1,radius)),material);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  // Rounded corner trims and fine floor belts soften the licensed facade while
  // leaving its windows, proportions and structural geometry intact.
  for(const x of [-23.14,23.14])for(const z of [-7.96,7.96])addRounded('soft-corner-trim',[.92,Math.max(1,roofHeight-.7),.92],[x,roofHeight/2,z],softTrim,.4);
  const floorCount=Math.max(2,Math.round(roofHeight/3.1));
  for(let floor=1;floor<=floorCount;floor++){
    const y=roofHeight*floor/(floorCount+1);
    addRounded('rounded-floor-belt',[46.25,.14,.14],[0,y,-8.035],softTrim,.06);
    addRounded('rounded-floor-belt',[46.25,.14,.14],[0,y,8.035],softTrim,.06);
    addRounded('rounded-floor-belt',[.14,.14,15.92],[-23.19,y,0],softTrim,.06);
    addRounded('rounded-floor-belt',[.14,.14,15.92],[23.19,y,0],softTrim,.06);
  }
  const front=8.073;
  add('entrance-lobby-floor',[6.4,.07,3],[0,.015,front-.15],stone);
  add('entrance-threshold',[8.8,.1,2.6],[0,.025,front+1.3],stone);
  add('cantilever-canopy',[9.2,.16,3.5],[0,3.52,front+.8],stone);
  add('canopy-status-edge',[9.3,.055,.065],[0,3.49,front+2.55],cyan);
  for(const x of [-3.12,-1.08,1.08,3.12])add('entry-mullion',[.055,3.18,.09],[x,1.61,front+.08],metal);
  for(const x of [-2.07,0,2.07])add('entry-glazing',[2.01,3.04,.025],[x,1.60,front+.04],glass);
  for(const x of [-.72,.72]){
    add('sliding-door',[1.40,2.7,.028],[x,1.40,front+.15],glass);
    for(const dx of [-.71,.71])add('door-frame',[.032,2.72,.04],[x+dx,1.40,front+.19],metal);
    add('door-handle',[.022,.46,.03],[x*.16,1.32,front+.22],metal);
  }
  for(const x of [-4,4])add('canopy-post',[.07,3.5,.07],[x,1.75,front+2.12],metal);
  for(let x=-4.2;x<=4.2;x+=.6)add('canopy-soffit',[.045,.035,3.16],[x,3.42,front+.82],metal);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#344a4f';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#f1efe2';ctx.font='36px sans-serif';ctx.textAlign='center';ctx.fillText(label,512,80);
  const signTexture=new THREE.CanvasTexture(canvas);signTexture.colorSpace=THREE.SRGBColorSpace;signTexture.userData.officeSign=true;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(7,.875),new THREE.MeshStandardMaterial({map:signTexture,roughness:.7}));sign.name='entrance-sign';sign.position.set(0,4.25,front+.05);root.add(sign);
  const roofPartsStart=root.children.length;
  for(const x of [-23.25,23.25])add('roof-edge',[.1,.18,16],[x,32.1,0],metal);
  for(const z of [-7.95,7.95])add('roof-edge',[46.4,.18,.1],[0,32.1,z],metal);
  for(const x of [-18,-12,-6,0,6,12,18])for(const z of [-4.4,-1.15]){
    const module=new THREE.Group();module.position.set(x,32.48,z);module.rotation.x=-.16;root.add(module);
    add('solar-panel-frame',[4.9,.055,2.55],[0,0,0],metal,module);add('solar-panel',[4.79,.019,2.44],[0,.04,0],solar,module);
    add('solar-support',[.055,.47,2.1],[-1.8,-.25,0],metal,module);add('solar-support',[.055,.47,2.1],[1.8,-.25,0],metal,module);
  }
  for(const x of [-12,12]){
    add('air-handler',[3.8,1.3,2.5],[x,32.68,4.3],stone);
    for(let z=3.3;z<5.3;z+=.18)add('air-handler-louvre',[3.3,.055,.035],[x,33.35,z],metal);
    for(const dx of [-.8,.8]){const fan=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.08,32),metal);fan.position.set(x+dx,33.38,4.3);root.add(fan);}
  }
  for(const x of [-4.1,4.1]){
    add('roof-skylight-frame',[5.2,.25,2.4],[x,32.15,4.3],metal);add('roof-skylight-glass',[5.08,.04,2.26],[x,32.3,4.3],glass);
    for(const dx of [-1.7,0,1.7])add('skylight-mullion',[.035,.04,2.3],[x+dx,32.34,4.3],metal);
  }
  for(const part of root.children.slice(roofPartsStart))part.position.y+=roofHeight-32;
  root.userData={license:'ISC',author:'Digital Twin Logistics project',units:'metres',purpose:'original entrance, canopy, signage and roof equipment'};
  root.updateMatrixWorld(true);const staticParts=[];root.traverse(o=>{if(o.isMesh)staticParts.push(o);});root.clear();
  for(const part of staticParts){part.matrixWorld.decompose(part.position,part.quaternion,part.scale);root.add(part);}
  return mergeStaticChildren(root);
}

export function prepareOffice(scene,label,height,details=true,nightMode=false){
  const object=scene.clone(true),materials=new Map();object.updateMatrixWorld(true);
  object.traverse(o=>{if(!o.isMesh)return;const source=o.material;if(!materials.has(source)){let m=source.clone();m.forceSinglePass=true;
    // Remove the scanned photo surfaces from the display copy. The source GLB
    // remains untouched; flat colour keeps the approved building geometry but
    // brings its visual language in line with the rounded campus assets.
    for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','bumpMap','alphaMap','lightMap'])m[slot]=null;
    const palette={
      walls_exterior:A.wall,rams:'#7592a8',
      Material_17:'#d6e0e8',walls_BLD_OFFICE_05:A.wall,material:A.wall,
      Color_007:A.glass,Blinds_Roman_Hobbled_Blue:'#a9c5d8'
    };
    if(m.name==='glass'){
      const name=m.name;m.dispose();
      m=new THREE.MeshStandardMaterial({name,map:nightMode?OFFICE_NIGHT_GLASS_TEXTURE:details?OFFICE_GLASS_TEXTURE:CONTEXT_GLASS_TEXTURE,emissive:nightMode?'#edc78f':'#000000',emissiveMap:nightMode?OFFICE_NIGHT_GLASS_TEXTURE:null,emissiveIntensity:nightMode?.3:0,color:'#ffffff',roughness:nightMode?.62:.4,metalness:.12,envMapIntensity:nightMode?.08:.3,side:THREE.DoubleSide});
    }else if(palette[m.name])m.color.set(palette[m.name]);
    m.roughness=m.name==='glass'?(nightMode?.62:.4):.8;m.metalness=m.name==='glass'?.12:.03;m.envMapIntensity=m.name==='glass'?(nightMode?.08:.3):.12;
    m.needsUpdate=true;materials.set(source,m);
  }o.material=materials.get(source);
    if(source.name==='glass'&&!o.geometry.attributes.uv){
      // Project reflections on the optimized curtain wall without altering GLTF files.
      o.geometry=o.geometry.clone();o.userData.displayGeometry=true;
      const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,uv=new Float32Array(p.count*2);
      const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix);
        uv[i*2]=Math.abs(normal.x)>Math.abs(normal.z)?(point.z+9.4)/18.8:(point.x+23.4)/46.8;
        uv[i*2+1]=point.y/33.44;
      }
      o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    }
  });
  if(details)object.add(createOfficeArchitecture(label,height,nightMode));object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.forceSinglePass=true;}});
  return object;
}
export function disposeOffice(object){
  const accents=object.getObjectByName('original-office-accents');
  accents?.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.material.map?.userData.officeSign)o.material.map.dispose();}});
  object.traverse(o=>{if(o.isMesh&&o.userData.displayGeometry)o.geometry.dispose();});
  const materials=new Set();object.traverse(o=>{if(o.isMesh)materials.add(o.material);});materials.forEach(m=>m.dispose());
}
