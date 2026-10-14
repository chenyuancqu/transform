import {writeFile,mkdir} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createMotherVehicle} from '../src/rendering/MotherVehicleAsset.js';

globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}
};
const scene=new THREE.Scene();const model=createMotherVehicle();scene.add(model);
model.position.y-=new THREE.Box3().setFromObject(model).min.y;
model.updateMatrixWorld(true);
const bounds=new THREE.Box3().setFromObject(scene);const size=bounds.getSize(new THREE.Vector3());
const binary=await new GLTFExporter().parseAsync(scene,{binary:true});
await mkdir('public/assets/campus/vehicles',{recursive:true});
await writeFile('public/assets/campus/vehicles/mother-carrier-original.glb',Buffer.from(binary));
let triangles=0,meshes=0;scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;}});
const report={name:'Mother Carrier',original:true,license:'ISC',units:'metres',dimensions:{width:size.x,height:size.y,length:size.z},bottom:bounds.min.y,bytes:binary.byteLength,meshes,triangles,pivots:['steering_fl','steering_fr','wheel_fl','wheel_fr','wheel_rl','wheel_rr','roof_hatch_pivot'],stage:'user-approved exterior; real receiving opening and cargo bay added',bay:{openingWidth:1.13,openingLength:1.25,conveyorTop:1.089,hatchOpenRadians:Math.PI*.60}};
await writeFile('public/assets/campus/vehicles/mother-carrier-original.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
