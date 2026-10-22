import React,{useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {prepareOffice,disposeOffice} from './OfficeArchitecture.js';
import {DISTRICT_LAYOUT} from './districtScenePlan.js';
import {CAMPUS_ART as A} from './CampusArtDirection.js';

export const CONTEXT_OFFICE_URL='/assets/campus/optimized/buildings/context-office.gltf';
function RoadBatch({records,color,paint=false}){
  const ref=useRef();
  useLayoutEffect(()=>{
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
    records.forEach(({x,y,z,w,d},i)=>ref.current.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),rotation,new THREE.Vector3(w,d,1))));
    ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();
  },[records]);
  return <instancedMesh ref={ref} args={[undefined,undefined,records.length]} receiveShadow><planeGeometry args={[1,1]}/><meshStandardMaterial color={color} roughness={.95} polygonOffset={paint} polygonOffsetFactor={paint?-2:0} polygonOffsetUnits={paint?-4:0}/></instancedMesh>;
}
function OfficeBatch({geometry,material,matrices}){
  const ref=useRef();
  useLayoutEffect(()=>{matrices.forEach((matrix,i)=>ref.current.setMatrixAt(i,matrix));ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[matrices]);
  return <instancedMesh ref={ref} args={[geometry,material,matrices.length]} castShadow receiveShadow dispose={null}/>;
}
function DistrictOffices({nightMode=false}){
  const {scene}=useGLTF(CONTEXT_OFFICE_URL);
  const template=useMemo(()=>prepareOffice(scene,'',32,false,nightMode),[scene,nightMode]);
  const parts=useMemo(()=>{
    template.updateMatrixWorld(true);const result=[];
    template.traverse(mesh=>{if(!mesh.isMesh)return;result.push({geometry:mesh.geometry,material:mesh.material,matrices:DISTRICT_LAYOUT.buildings.map(b=>new THREE.Matrix4().compose(new THREE.Vector3(b.x,0,b.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw),new THREE.Vector3(b.width/46.712,b.height/32,b.depth/16.146)).multiply(mesh.matrixWorld))});});
    return result;
  },[template]);
  useEffect(()=>()=>disposeOffice(template),[template]);
  return <group name="district-buildings-approved">{parts.map((part,i)=><OfficeBatch key={i} {...part}/>)}</group>;
}
export function CampusDistrictContext({nightMode=false}){
  return <group name="surrounding-district"><group name="district-road-network">
    <RoadBatch records={DISTRICT_LAYOUT.roads} color={A.road}/>
    <RoadBatch records={DISTRICT_LAYOUT.sidewalks} color={A.paving}/>
    <RoadBatch records={DISTRICT_LAYOUT.paint} color="#eee3d6" paint/>
  </group><DistrictOffices nightMode={nightMode}/></group>;
}
useGLTF.preload(CONTEXT_OFFICE_URL);
