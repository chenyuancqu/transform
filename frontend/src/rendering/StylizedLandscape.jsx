import React,{useMemo,useLayoutEffect,useEffect,useRef} from 'react';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {CAMPUS_TREES,GARDENS} from './campusScenePlan.js';

const ROOT='/assets/campus/stylized/nature';
export const STYLIZED_NATURE_URLS=['cluster-tree','broad-tree','rounded-shrub','bench'].map(id=>`${ROOT}/${id}.glb`);
// Real imported CC0 meshes, smoothly subdivided offline. Opaque foliage has
// dense silhouettes without expensive overlapping alpha cards or large atlases.
function NatureBatch({url,placements,colour}){
  const {scene}=useGLTF(url);
  const parts=useMemo(()=>{
    scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(scene,true),center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
    const normalise=new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z),parts=[];
    scene.traverse(mesh=>{if(!mesh.isMesh)return;const material=mesh.material.clone();material.forceSinglePass=true;const leafy=/canopy/.test(material.name);
      const matrices=placements.map(([x,z,h,yaw=0])=>new THREE.Matrix4().compose(new THREE.Vector3(x,.05,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3().setScalar(h/height)).multiply(normalise).multiply(mesh.matrixWorld));
      const colours=placements.map((_,i)=>leafy?new THREE.Color(colour).offsetHSL((i%5-2)*.007,(i%3-1)*.025,(i%4-1.5)*.025):new THREE.Color('white'));
      if(leafy)material.color.set('white');parts.push({geometry:mesh.geometry,material,matrices,colours});
    });return parts;
  },[scene,placements,colour]);
  useEffect(()=>()=>parts.forEach(p=>p.material.dispose()),[parts]);
  return <group name={'nature-'+url.split('/').at(-1)}>{parts.map((part,i)=><NatureInstances key={i} {...part}/>)}</group>;
}
function NatureInstances({geometry,material,matrices,colours}){
  const ref=useRef();useLayoutEffect(()=>{matrices.forEach((m,i)=>{ref.current.setMatrixAt(i,m);ref.current.setColorAt(i,colours[i]);});ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[matrices,colours]);
  return <instancedMesh ref={ref} args={[geometry,material,matrices.length]} castShadow receiveShadow dispose={null}/>;
}
export function StylizedLandscape(){
  const broad=useMemo(()=>CAMPUS_TREES.filter((_,i)=>i%3===0).map(([x,z,h],i)=>[x,z,h,i*2.39]),[]);
  const clustered=useMemo(()=>CAMPUS_TREES.filter((_,i)=>i%3!==0).map(([x,z,h],i)=>[x,z,h,i*1.9]),[]);
  const shrubs=useMemo(()=>GARDENS.flatMap(([x,z])=>Array.from({length:16},(_,i)=>[x-5.5+(i%4)*3.65,z-2.9+Math.floor(i/4)*1.95,.65+(i%3)*.04,i*1.87])),[]);
  const benches=useMemo(()=>GARDENS.flatMap(([x,z])=>[[x-7,z,.9,Math.PI/2],[x+7,z,.9,-Math.PI/2]]),[]);
  return <><NatureBatch url={STYLIZED_NATURE_URLS[0]} placements={clustered} colour="#77b879"/><NatureBatch url={STYLIZED_NATURE_URLS[1]} placements={broad} colour="#91c581"/><NatureBatch url={STYLIZED_NATURE_URLS[2]} placements={shrubs} colour="#6da875"/><NatureBatch url={STYLIZED_NATURE_URLS[3]} placements={benches}/></>;
}

export function DistrictStreetTrees(){
  const placements=useMemo(()=>{
    const roads=[-300,-210,-120,120,210,300],result=[];
    for(const road of roads)for(const side of [-1,1])for(let along=-378,index=0;along<=378;along+=42,index++){
      if(roads.some(other=>Math.abs(along-other)<13))continue;
      result.push([along,road+side*7.5,8.5+(index%4)*.55,index*.73+road*.001]);
      result.push([road+side*7.5,along,8.7+((index+2)%4)*.5,index*.91+road*.001]);
    }
    return result;
  },[]);
  return <NatureBatch url={STYLIZED_NATURE_URLS[1]} placements={placements} colour="#91c581"/>;
}
