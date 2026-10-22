import React,{useMemo,useEffect} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeStaticChildren} from './MergeStaticMeshes.js';
import {CAMPUS_ART as A} from './CampusArtDirection.js';

const pavingCanvas=document.createElement('canvas');pavingCanvas.width=pavingCanvas.height=256;
const pavingContext=pavingCanvas.getContext('2d');
pavingContext.fillStyle='#c9bdb3';pavingContext.fillRect(0,0,256,256);
for(let y=0;y<4;y++)for(let x=0;x<4;x++){
  pavingContext.fillStyle=['#d8cbc0','#cfc1b8','#d3c6bc'][(x+y*3)%3];
  pavingContext.fillRect(x*64+1,y*64+1,62,62);
}
export const COURTYARD_TEXTURE=new THREE.CanvasTexture(pavingCanvas);
COURTYARD_TEXTURE.colorSpace=THREE.SRGBColorSpace;
COURTYARD_TEXTURE.wrapS=COURTYARD_TEXTURE.wrapT=THREE.RepeatWrapping;
COURTYARD_TEXTURE.repeat.set(.25,.25);COURTYARD_TEXTURE.anisotropy=4;

function makeForecourt(){
  const root=new THREE.Group();root.name='campus-logistics-forecourt';
  const dark=new THREE.MeshStandardMaterial({color:'#4d4148',roughness:.85});
  const silver=new THREE.MeshStandardMaterial({color:A.trim,roughness:.8});
  const cyan=new THREE.MeshBasicMaterial({color:A.cyan});
  const screen=new THREE.MeshStandardMaterial({color:A.navy,roughness:.42});
  const mesh=(geometry,material,position,rotation)=>{const o=new THREE.Mesh(geometry,material);o.position.set(...position);if(rotation)o.rotation.set(...rotation);root.add(o);return o;};
  const stripe=(x,z,w,d,material=cyan)=>mesh(new THREE.PlaneGeometry(w,d),material,[x,.032,z],[-Math.PI/2,0,0]);
  const rounded=(w,d,r)=>{const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;};
  mesh(new THREE.ShapeGeometry(rounded(13,10,1.1),12),dark,[0,.024,0],[-Math.PI/2,0,0]);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    stripe(sx*5.25,sz*4.7,2.5,.12);stripe(sx*6.15,sz*3.9,.12,1.7);
    // A quiet boundary, with no tall objects inside the authoritative driving area.
    stripe(sx*29.5,sz*31.5,5,.09,silver);stripe(sx*31.5,sz*29.5,.09,5,silver);
  }
  for(const [x,z] of [[-10,0],[10,0],[0,-10]]){
    mesh(new THREE.RingGeometry(1.1,1.2,40),silver,[x,.03,z],[-Math.PI/2,0,0]);
    stripe(x,z,1.4,.055,silver);stripe(x,z,.055,1.4,silver);
  }
  for(const side of [-1,1]){
    stripe(side*24,0,.1,19,silver);
    for(const z of [-9.5,-3.2,3.2,9.5])stripe(side*26.5,z,5,.1,silver);
  }
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#4d4148';ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#e0cde0';ctx.textAlign='center';ctx.font='500 42px sans-serif';ctx.fillText('MEC / DISPATCH',256,80);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const labelMaterial=new THREE.MeshBasicMaterial({map:labelTexture});
  mesh(new THREE.PlaneGeometry(8,2),labelMaterial,[0,.034,3],[-Math.PI/2,0,0]);
  for(const x of [-62,62])for(const z of [-54,54]){
    mesh(new RoundedBoxGeometry(.7,1.5,.5,2,.07),silver,[x,.75,z]);
    mesh(new THREE.BoxGeometry(.55,.75,.035),screen,[x,1,z+.27]);
    mesh(new THREE.BoxGeometry(.46,.025,.04),cyan,[x,1.41,z+.275]);
  }
  mergeStaticChildren(root);root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
  return root;
}
export function CampusForecourt(){
  const object=useMemo(makeForecourt,[]);
  useEffect(()=>()=>{const materials=new Set();object.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>{m.map?.dispose();m.dispose();});},[object]);
  return <primitive object={object} dispose={null}/>;
}
