import React,{useMemo,useLayoutEffect,useEffect,useRef} from 'react';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {CAMPUS_TREES,GARDENS,LOW_GARDENS,DISTRICT_TREES} from './campusScenePlan.js';

const ROOT='/assets/campus/stylized/nature';
export const STYLIZED_NATURE_URLS=['cluster-tree','broad-tree','rounded-shrub','bench'].map(id=>`${ROOT}/${id}.glb`);
// Real imported CC0 meshes, smoothly subdivided offline. Opaque foliage has
// dense silhouettes without expensive overlapping alpha cards or large atlases.
function NatureBatch({url,placements,colour,spread=1}){
  const {scene}=useGLTF(url);
  const parts=useMemo(()=>{
    scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(scene,true),center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
    const normalise=new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z),parts=[];
    scene.traverse(mesh=>{if(!mesh.isMesh)return;const material=mesh.material.clone();material.forceSinglePass=true;material.roughness=.92;material.metalness=0;material.envMapIntensity=.15;const leafy=/canopy/.test(material.name);
      const matrices=placements.map(([x,z,h,yaw=0])=>new THREE.Matrix4().compose(new THREE.Vector3(x,.05,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(h/height*spread,h/height,h/height*spread)).multiply(normalise).multiply(mesh.matrixWorld));
      const colours=placements.map((_,i)=>leafy?new THREE.Color(colour).offsetHSL((i%5-2)*.007,(i%3-1)*.025,(i%4-1.5)*.025):new THREE.Color('white'));
      if(leafy)material.color.set('white');parts.push({geometry:mesh.geometry,material,matrices,colours});
    });return parts;
  },[scene,placements,colour,spread]);
  useEffect(()=>()=>parts.forEach(p=>p.material.dispose()),[parts]);
  return <group name={'nature-'+url.split('/').at(-1)}>{parts.map((part,i)=><NatureInstances key={i} {...part}/>)}</group>;
}
function NatureInstances({geometry,material,matrices,colours}){
  const ref=useRef();useLayoutEffect(()=>{matrices.forEach((m,i)=>{ref.current.setMatrixAt(i,m);ref.current.setColorAt(i,colours[i]);});ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[matrices,colours]);
  return <instancedMesh ref={ref} args={[geometry,material,matrices.length]} castShadow receiveShadow dispose={null}/>;
}
export function StylizedLandscape(){
  const broad=useMemo(()=>CAMPUS_TREES.filter((_,i)=>i%2!==0).map(([x,z,h],i)=>[x,z,h,i*2.39]),[]);
  const clustered=useMemo(()=>CAMPUS_TREES.filter((_,i)=>i%2===0).map(([x,z,h],i)=>[x,z,h,i*1.9]),[]);
  const shrubs=useMemo(()=>[...GARDENS,...LOW_GARDENS].flatMap(([x,z],plot)=>Array.from({length:16},(_,i)=>[x-5.5+(i%4)*3.65,z-2.9+Math.floor(i/4)*1.95,(plot>=GARDENS.length?.55:.7)+(i%3)*.04,i*1.87])),[]);
  const benches=useMemo(()=>GARDENS.flatMap(([x,z])=>[[x-7,z,.9,Math.PI/2],[x+7,z,.9,-Math.PI/2]]),[]);
  return <><NatureBatch url={STYLIZED_NATURE_URLS[0]} placements={clustered} colour="#4c8c70"/><NatureBatch url={STYLIZED_NATURE_URLS[1]} placements={broad} colour="#72a576"/><NatureBatch url={STYLIZED_NATURE_URLS[2]} placements={shrubs} colour="#4c856c" spread={2.4}/><NatureBatch url={STYLIZED_NATURE_URLS[3]} placements={benches}/></>;
}

export function DistrictStreetTrees(){
  return <NatureBatch url={STYLIZED_NATURE_URLS[1]} placements={DISTRICT_TREES} colour="#72a576"/>;
}
