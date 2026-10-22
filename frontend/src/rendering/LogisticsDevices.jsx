import React,{useMemo,useRef,useEffect} from 'react';
import {useFrame} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {businessToWorld} from './CoordinateSystem.js';
import {createDeviceLOD,disposeDeviceMaterials,deviceURLs} from './OptimizedAssetLOD.js';
import {ParcelModel} from './ParcelModel.jsx';
import {synchronizeVisualPosition} from './DeviceMotion.js';
import {MotionTrail, UavMissionRoute} from './DeviceTrajectories.jsx';
import CARRIER_PAD_LAYOUT from '../core/campusCarrierPads.json';

const lift=p=>{const t=THREE.MathUtils.clamp((p-.28)/.47,0,1);return t*t*(3-2*t);};
const shortAngle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const HOME_PHASES=new Set(['charging','docked']);
const CARRIER_PADS=CARRIER_PAD_LAYOUT.positions;
const DRONE_URLS=deviceURLs('matrice-300');
const MOTHER_URLS=deviceURLs('mother');
export function DroneAsset({uav,index,visualUAVs,running,orders,rover,showTrajectories=true,selected=false,nightMode=false}){
  const sources=useGLTF(DRONE_URLS);const asset=useMemo(()=>createDeviceLOD(sources.map(s=>s.scene),[0,22,75],{technology:true}),[sources[0].scene,sources[1].scene,sources[2].scene]);
  useEffect(()=>()=>disposeDeviceMaterials(asset),[asset]);
  const normalized=useMemo(()=>{const box=new THREE.Box3().setFromObject(asset.levels[0].object,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());return {factor:1.45/Math.max(size.x,size.z),offset:[-center.x,-center.y,-center.z]};},[asset]);
  const rotors=useMemo(()=>asset.levels.flatMap(({object})=>[1,2,3,4].map(i=>object.getObjectByName('rotor_'+i))),[asset]);
  const rotorDiscs=useMemo(()=>{
    const object=asset.levels[0].object;object.updateMatrixWorld(true);
    return [1,2,3,4].map(i=>{const rotor=object.getObjectByName('rotor_'+i);if(!rotor)return null;const size=new THREE.Box3().setFromObject(rotor,true).getSize(new THREE.Vector3());return {position:rotor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...normalized.offset)).toArray(),radius:Math.max(size.x,size.z)*.48};}).filter(Boolean);
  },[asset,normalized]);
  const blur=useRef([]),motorSpeed=useRef(HOME_PHASES.has(uav.phase)||uav.phase==='idle'?0:200);
  const body=useRef(),tilt=useRef(),cable=useRef(),claw=useRef(),cargo=useRef();const posture=useRef(['idle','charging','docked','parking','cruising'].includes(uav.phase)?1:uav.phase==='clearingBay'?THREE.MathUtils.smoothstep(uav.retractProgress||0,.65,1):0);const foldedScale=useRef(HOME_PHASES.has(uav.phase)?CARRIER_PAD_LAYOUT.stowedAircraftScale:1);
  const target=useMemo(()=>new THREE.Vector3(),[]);const initial=useRef(businessToWorld(uav.x,uav.y,uav.z));
  useFrame(({camera,gl},delta)=>{
    if(!body.current)return;const level=asset.getCurrentLevel();asset.update(camera);if(level!==asset.getCurrentLevel())gl.shadowMap.needsUpdate=true;const dt=Math.min(delta,.1),world=businessToWorld(uav.x,uav.y,uav.z);target.set(world.x,world.y,world.z);
    const previous=body.current.position.clone();synchronizeVisualPosition(body.current.position,target,delta,running);if(!running&&!previous.equals(body.current.position))gl.shadowMap.needsUpdate=true;
    const dx=body.current.position.x-previous.x,dz=body.current.position.z-previous.z,velocity=previous.distanceTo(body.current.position)/Math.max(delta,.001);
    const beforeYaw=body.current.rotation.y;
    if(HOME_PHASES.has(uav.phase))body.current.rotation.y=rover.heading||0;
    else if(running&&Math.hypot(dx,dz)>.001)body.current.rotation.y+=shortAngle(beforeYaw,Math.atan2(dx,dz))*(1-Math.exp(-dt*7));
    foldedScale.current=THREE.MathUtils.damp(foldedScale.current,HOME_PHASES.has(uav.phase)?CARRIER_PAD_LAYOUT.stowedAircraftScale:1,7,dt);
    if(tilt.current){tilt.current.scale.setScalar(normalized.factor*foldedScale.current);if(running){const stable=['aligning','picking','unloading','clearingBay','idle','charging','docked'].includes(uav.phase);tilt.current.rotation.x=THREE.MathUtils.damp(tilt.current.rotation.x,stable?0:Math.min(.07,Math.hypot(dx,dz)/Math.max(delta,.001)*.014),6,dt);tilt.current.rotation.z=THREE.MathUtils.damp(tilt.current.rotation.z,stable?0:THREE.MathUtils.clamp(-shortAngle(beforeYaw,body.current.rotation.y)/Math.max(delta,.001)*.07,-.11,.11),6,dt);}}
    const progress=uav.phase==='picking'?uav.pickupProgress:0;const unload=uav.phase==='unloading'?uav.unloadProgress:0;
    let length=.08;if(uav.phase==='picking')length=.04+.38*Math.min(1,progress/.28)-.3*lift(progress);else if(uav.cargoOrderId!=null)length=.12+.64*unload;
    if(uav.phase==='clearingBay')length=.76-.68*(uav.retractProgress||0);
    const stow=['idle','charging','docked','takingOff','parking','cruising'].includes(uav.phase)?1:uav.phase==='clearingBay'?THREE.MathUtils.smoothstep(uav.retractProgress||0,.65,1):0;
    if(running)posture.current=THREE.MathUtils.damp(posture.current,stow,10,dt);
    const clawY=THREE.MathUtils.lerp(-.28-length,-.27,posture.current),rope=Math.max(.003,-clawY-.28);
    if(cable.current){cable.current.position.y=-.28-rope/2;cable.current.scale.y=rope;cable.current.visible=posture.current<.97;}
    if(claw.current){claw.current.position.y=clawY;claw.current.rotation.x=posture.current*Math.PI/2;}
    if(cargo.current){cargo.current.position.y=-.65-.64*unload;cargo.current.visible=unload<.98;}
    if(running){
      motorSpeed.current=THREE.MathUtils.damp(motorSpeed.current,HOME_PHASES.has(uav.phase)||uav.phase==='idle'?0:210,5,dt);
      rotors.forEach((r,i)=>{if(r)r.rotation.y+=dt*motorSpeed.current*([1,-1,-1,1][i%4]);});
      blur.current.forEach(disc=>{if(disc){disc.visible=motorSpeed.current>40;disc.material.opacity=.11*THREE.MathUtils.clamp(motorSpeed.current/210,0,1);}});
    }
    visualUAVs.current[uav.id]={position:{x:body.current.position.x,y:body.current.position.y,z:body.current.position.z},speed:velocity,pickupOrderId:uav.phase==='picking'?uav.targetOrderId:null,pickupProgress:progress,cargoOrderId:uav.cargoOrderId,unloadProgress:unload};
  });
  return <group><MotionTrail sourceRef={body} visible={showTrajectories} selected={selected}/><UavMissionRoute uav={uav} orders={orders} rover={rover} visualUAVs={visualUAVs} visible={showTrajectories} selected={selected} nightMode={nightMode} index={index}/><group ref={body} name={`device-uav-${uav.id}`} position={[initial.current.x,initial.current.y,initial.current.z]} userData={{labelHeight:.65}}>
    <group ref={tilt} scale={normalized.factor*(HOME_PHASES.has(uav.phase)?CARRIER_PAD_LAYOUT.stowedAircraftScale:1)}><primitive object={asset} position={normalized.offset}/>{rotorDiscs.map((disc,i)=><mesh key={i} ref={node=>blur.current[i]=node} position={disc.position} rotation-x={-Math.PI/2} visible={!HOME_PHASES.has(uav.phase)&&uav.phase!=='idle'}><circleGeometry args={[disc.radius,32]}/><meshBasicMaterial color="#d8c2df" transparent opacity={.11} depthWrite={false} side={THREE.DoubleSide}/></mesh>)}</group>
    <mesh ref={cable}><cylinderGeometry args={[.006,.006,1,8]}/><meshStandardMaterial color="#a5b2b3" metalness={.8} roughness={.32}/></mesh>
    <group ref={claw}><mesh><boxGeometry args={[.73,.035,.11]}/><meshStandardMaterial color="#687b82" metalness={.8} roughness={.3}/></mesh>{[-1,1].map(s=><mesh key={s} position={[s*.34,-.09,0]}><boxGeometry args={[.026,.20,.10]}/><meshStandardMaterial color="#c0a174" metalness={.6} roughness={.4}/></mesh>)}</group>
    {uav.cargoOrderId!=null&&<group ref={cargo} name={`cargo-parcel-uav-${uav.id}`} position={[0,-.65,0]}><ParcelModel orderId={uav.cargoOrderId}/></group>}
  </group></group>;
}
export function MotherAsset({rover,docking,running,orders,elapsed,showTrajectories=true,selected=false}){
  const sources=useGLTF(MOTHER_URLS);const asset=useMemo(()=>createDeviceLOD(sources.map(s=>s.scene),[0,28],{technology:true}),[sources[0].scene,sources[1].scene]);
  useEffect(()=>()=>disposeDeviceMaterials(asset),[asset]);
  const body=useRef(),travel=useRef(0),target=useMemo(()=>new THREE.Vector3(),[]);const initial=useRef(businessToWorld(rover.x,rover.y,0));
  const wheels=useMemo(()=>asset.levels.flatMap(({object})=>['fl','fr','rl','rr'].map(k=>object.getObjectByName('wheel_'+k))),[asset]);const steers=useMemo(()=>asset.levels.flatMap(({object})=>['fl','fr'].map(k=>object.getObjectByName('steering_'+k))),[asset]);const hatches=useMemo(()=>asset.levels.map(({object})=>object.getObjectByName('roof_hatch_pivot')),[asset]);
  const transfer=useRef();const lastDelivered=orders.filter(o=>o.deliveredAt!=null).sort((a,b)=>b.deliveredAt-a.deliveredAt)[0];
  useFrame(({camera,gl},delta)=>{
    if(!body.current)return;const level=asset.getCurrentLevel();asset.update(camera);if(level!==asset.getCurrentLevel())gl.shadowMap.needsUpdate=true;const dt=Math.min(delta,.1),world=businessToWorld(rover.x,rover.y,0);target.set(world.x,0,world.z);const previous=body.current.position.clone(),yaw=body.current.rotation.y;
    synchronizeVisualPosition(body.current.position,target,delta,running);if(!running&&!previous.equals(body.current.position))gl.shadowMap.needsUpdate=true;
    if(running)body.current.rotation.y+=shortAngle(yaw,rover.heading||0)*(1-Math.exp(-delta*14));else body.current.rotation.y=rover.heading||0;
    const dx=body.current.position.x-previous.x,dz=body.current.position.z-previous.z,speed=Math.hypot(dx,dz)/Math.max(delta,.001),signed=dx*Math.sin(body.current.rotation.y)+dz*Math.cos(body.current.rotation.y);if(running)travel.current+=signed;
    wheels.forEach(w=>{if(w)w.rotation.x=travel.current/.382;});
    const steering=speed>.05?THREE.MathUtils.clamp(Math.atan(2.76*shortAngle(yaw,body.current.rotation.y)/Math.max(delta,.001)/speed),-.45,.45):0;
    if(running)steers.forEach(s=>{if(s)s.rotation.y=THREE.MathUtils.damp(s.rotation.y,steering,8,dt);});
    hatches.forEach(hatch=>{if(hatch)hatch.rotation.z=THREE.MathUtils.smoothstep(docking?.hatchProgress||0,0,1)*Math.PI*.60;});
    if(transfer.current&&lastDelivered){const p=THREE.MathUtils.clamp((elapsed-lastDelivered.deliveredAt)/.6,0,1);transfer.current.position.z=-.15-.95*p;transfer.current.visible=p<1;}
  });
  return <group><MotionTrail sourceRef={body} grounded visible={showTrajectories} selected={selected}/><group ref={body} name="device-rover" position={[initial.current.x,0,initial.current.z]} rotation-y={rover.heading||0} userData={{labelHeight:2.2}}><primitive object={asset}/>{CARRIER_PADS.map(([x,z],index)=><group key={index} name={`uav-carrier-pad-${index+1}`} position={[x,0,z]}>
      <mesh position={[0,CARRIER_PAD_LAYOUT.deckHeight,0]} castShadow receiveShadow><boxGeometry args={[.84,.07,.84]}/><meshStandardMaterial color="#263f50" metalness={.62} roughness={.3}/></mesh>
      <mesh position={[0,CARRIER_PAD_LAYOUT.deckHeight+.04,0]} rotation-x={-Math.PI/2}><ringGeometry args={[.28,.30,36]}/><meshBasicMaterial color="#a47db8" transparent opacity={.82} side={THREE.DoubleSide}/></mesh>
      <mesh position={[0,CARRIER_PAD_LAYOUT.deckHeight+.04,0]}><cylinderGeometry args={[.045,.045,.012,24]}/><meshStandardMaterial color="#c7a8d2" emissive="#8d64a4" emissiveIntensity={.34} metalness={.35}/></mesh>
    </group>)}{lastDelivered&&<group ref={transfer} position={[0,1.34,-.15]}><ParcelModel orderId={lastDelivered.id}/></group>}</group></group>;
}
DRONE_URLS.forEach(url=>useGLTF.preload(url));MOTHER_URLS.forEach(url=>useGLTF.preload(url));
