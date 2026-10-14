import * as THREE from 'three';
import {mergeStaticChildren} from './MergeStaticMeshes.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

function makeTexture(width,height,paint){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

// Soft, hand-designed reflections and clear solar-cell divisions keep these
// surfaces readable in daylight without relying on noisy photographic maps.
export const OFFICE_GLASS_TEXTURE=makeTexture(512,512,(ctx,w,h)=>{
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#d4e9dc');sky.addColorStop(.24,'#a9d3ce');sky.addColorStop(.55,'#6fa7ac');sky.addColorStop(1,'#47778b');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const glow=ctx.createLinearGradient(0,0,w*.8,h);glow.addColorStop(0,'#f7f4df88');glow.addColorStop(.32,'#f7f4df12');glow.addColorStop(.7,'#d8f3ee00');glow.addColorStop(1,'#edf7e61f');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#f7fff022';ctx.fillRect(0,h*.19,w,h*.055);ctx.fillRect(0,h*.63,w,h*.035);
  for(let x=26;x<w;x+=86){ctx.fillStyle='#f7fff01a';ctx.fillRect(x,0,9,h);}
});
export const OFFICE_SOLAR_TEXTURE=makeTexture(512,256,(ctx,w,h)=>{
  const base=ctx.createLinearGradient(0,0,w,h);base.addColorStop(0,'#568b8d');base.addColorStop(.5,'#78aaa3');base.addColorStop(1,'#47777f');
  ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
  const sheen=ctx.createLinearGradient(0,0,w*.65,h);sheen.addColorStop(0,'#f1f4df28');sheen.addColorStop(.38,'#e9fff10b');sheen.addColorStop(1,'#d6fff000');ctx.fillStyle=sheen;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#d4e5d777';ctx.lineWidth=3;
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*w/5,0);ctx.lineTo(i*w/5,h);ctx.stroke();}
  for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(0,i*h/3);ctx.lineTo(w,i*h/3);ctx.stroke();}
  ctx.strokeStyle='#344f55aa';ctx.lineWidth=6;ctx.strokeRect(3,3,w-6,h-6);
});

// Original architectural additions to the licensed GLB, in physical metres.
// Main structure, facades and interior remain the downloaded model.
export function createOfficeArchitecture(label='NEXUS / INNOVATION',roofHeight=32) {
  const root=new THREE.Group();root.name='original-office-accents';
  const stone=new THREE.MeshStandardMaterial({color:'#f0e8d9',roughness:.86});
  const softTrim=new THREE.MeshStandardMaterial({color:'#faf2e3',roughness:.82});
  const metal=new THREE.MeshStandardMaterial({color:'#b9c9bf',metalness:.12,roughness:.5});
  const glass=new THREE.MeshPhysicalMaterial({map:OFFICE_GLASS_TEXTURE,color:'#f5fff9',metalness:.05,roughness:.24,clearcoat:.38,clearcoatRoughness:.22,envMapIntensity:.2});
  const solar=new THREE.MeshStandardMaterial({map:OFFICE_SOLAR_TEXTURE,color:'#ffffff',metalness:.14,roughness:.42});
  const add=(name,size,position,material,parent=root)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const addRounded=(name,size,position,material,radius)=>{const m=new THREE.Mesh(new RoundedBoxGeometry(...size,3,radius),material);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  // Rounded corner trims and fine floor belts soften the licensed facade while
  // leaving its windows, proportions and structural geometry intact.
  for(const x of [-23.14,23.14])for(const z of [-7.96,7.96])addRounded('soft-corner-trim',[.72,Math.max(1,roofHeight-.7),.72],[x,roofHeight/2,z],softTrim,.3);
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
  add('canopy-metal-edge',[9.3,.075,.075],[0,3.49,front+2.55],metal);
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
  const signTexture=new THREE.CanvasTexture(canvas);signTexture.colorSpace=THREE.SRGBColorSpace;
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
