import React,{useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BALCONY_FLOORS,CAMPUS_BUILDINGS,OFFICE_DIMENSIONS} from './campusScenePlan.js';

const FRONT=OFFICE_DIMENSIONS.front-.12;
const DECK_DEPTH=3.6;

function matrixFor(building,position,rotationY=0,detailScale=[1,1,1]){
  const [sx,sy,sz]=building.visualScale||[1,1,1];
  const yaw=building.yaw||0;
  const orientation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const worldPosition=new THREE.Vector3(position[0]*sx,position[1]*sy,position[2]*sz)
    .applyQuaternion(orientation).add(new THREE.Vector3(...building.position));
  const localRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotationY);
  return new THREE.Matrix4().compose(worldPosition,orientation.clone().multiply(localRotation),new THREE.Vector3(sx*detailScale[0],sy*detailScale[1],sz*detailScale[2]));
}

function makeDetails(){
  const placements={deck:[],glassFront:[],glassSide:[],railFront:[],railSide:[],post:[],support:[],planter:[],foliage:[],signal:[]};
  for(const building of CAMPUS_BUILDINGS.filter(item=>(item.height??32)>=20)){
    for(const floor of BALCONY_FLOORS){
      const y=32*floor/11,z=FRONT;
      const add=(kind,position,rotation=0,detailScale)=>placements[kind].push(matrixFor(building,position,rotation,detailScale));
      add('deck',[0,y-.15,z+DECK_DEPTH/2]);
      add('glassFront',[0,y+.66,z+DECK_DEPTH-.14]);
      add('railFront',[0,y+1.22,z+DECK_DEPTH-.14]);
      add('railFront',[0,y+.16,z+DECK_DEPTH-.14]);
      for(const side of [-1,1]){
        add('glassSide',[side*7.03,y+.66,z+DECK_DEPTH/2],side*Math.PI/2);
        add('railSide',[side*7.03,y+1.22,z+DECK_DEPTH/2],side*Math.PI/2);
        add('railSide',[side*7.03,y+.16,z+DECK_DEPTH/2],side*Math.PI/2);
        add('planter',[side*5.35,y+.34,z+DECK_DEPTH-.68]);
        for(const offset of [-.36,0,.36])add('foliage',[side*5.35+offset,y+.9,z+DECK_DEPTH-.68],0,[.3,.35,.35]);
        add('support',[side*6.55,y-.47,z+DECK_DEPTH/2]);
      }
      for(const x of [-6.8,-3.4,0,3.4,6.8])add('post',[x,y+.68,z+DECK_DEPTH-.14]);
      add('signal',[0,y+.055,z+DECK_DEPTH-.12]);
    }
  }
  return placements;
}

function DetailInstances({kind,matrices}){
  const ref=useRef();
  const isGlass=kind==='glassFront'||kind==='glassSide';
  const {geometry,material}=useMemo(()=>{
    const shapes={
      deck:new RoundedBoxGeometry(14.4,.3,DECK_DEPTH,1,.07),
      glassFront:new THREE.BoxGeometry(13.35,1.02,.09),
      glassSide:new THREE.BoxGeometry(3.35,1.02,.09),
      railFront:new THREE.BoxGeometry(14.25,.09,.11),
      railSide:new THREE.BoxGeometry(DECK_DEPTH,.09,.11),
      post:new THREE.BoxGeometry(.11,1.2,.11),
      support:new THREE.BoxGeometry(.16,.62,.18),
      planter:new RoundedBoxGeometry(1.55,.58,.76,1,.06),
      foliage:new THREE.SphereGeometry(1,8,5),
      signal:new THREE.BoxGeometry(12.6,.045,.045)
    };
    const colors={deck:'#eee5d5',glassFront:'#b8dce8',glassSide:'#b8dce8',railFront:'#6c858d',railSide:'#6c858d',post:'#74878c',support:'#77878a',planter:'#c9aa7c',foliage:'#78a86c',signal:'#38cdda'};
    const isFrame=kind==='railFront'||kind==='railSide'||kind==='post';
    const props=isGlass?{color:colors[kind],roughness:.28,metalness:.05,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}
      :kind==='signal'?{color:colors[kind],emissive:colors[kind],emissiveIntensity:.26,roughness:.4}
      :{color:colors[kind],roughness:isFrame?.48:.84,metalness:isFrame?.2:0};
    return {geometry:shapes[kind],material:new THREE.MeshStandardMaterial(props)};
  },[kind]);
  useLayoutEffect(()=>{matrices.forEach((matrix,index)=>ref.current.setMatrixAt(index,matrix));ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[matrices]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  return <instancedMesh ref={ref} name={`balcony-${kind}`} args={[geometry,material,matrices.length]} castShadow={!isGlass&&kind!=='signal'} receiveShadow={kind==='deck'||kind==='planter'} dispose={null}/>;
}

export function CampusBuildingDetails(){
  const details=useMemo(makeDetails,[]);
  return <group name="campus-balcony-details">{Object.entries(details).map(([kind,matrices])=><DetailInstances key={kind} kind={kind} matrices={matrices}/>)}</group>;
}
