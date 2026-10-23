import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  useProgress
} from '@react-three/drei';
import * as THREE from 'three';
import { useCampusBackend } from '../services/useCampusBackend.js';
import { TaskConsole } from '../ui/TaskConsole.jsx';
import '../ui/task-console.css';
import '../ui/task-console-tech.css';
import '../ui/task-console-yto.css';
import { businessToWorld } from './CoordinateSystem.js';
import {CampusBuildings, DesignedCampusGround, CampusLandscape, CampusDaylight, CampusShadowCache, campusSurfaceHeight} from './CampusVisualEnvironment.jsx';
import {CAMPUS_BUILDINGS} from './campusScenePlan.js';
import {DroneAsset, MotherAsset} from './LogisticsDevices.jsx';
import {findAttachedObject} from './DeviceMotion.js';

import { CampusCamera, FreeCameraControls } from './CampusCameraControls.jsx';
// Parcel easing is presentation-only; pickup timing comes from backend telemetry.
const pickupLift = progress => { const t = Math.max(0, Math.min(1, (progress - .28) / .47)); return t * t * (3 - 2 * t); };
import { ParcelModel } from './ParcelModel.jsx';

const StaticCampus=React.memo(function StaticCampus({nightMode=false}){return <><CampusDaylight nightMode={nightMode}/><DesignedCampusGround/><CampusBuildings nightMode={nightMode}/><CampusLandscape nightMode={nightMode}/></>;});
const BUILDING_HEIGHT=32;
const BUILDINGS=CAMPUS_BUILDINGS;
const PHASE_LABELS={idle:'待命',docked:'母车待命',charging:'母车补能',takingOff:'从母车起飞',cruising:'前往取件',approaching:'减速对准',aligning:'稳定悬停',picking:'订单取货',returning:'携货返航',waitingDock:'排队返航',unloading:'母车入舱',clearingBay:'吊具回收',parking:'返回母车'};
const ORDER_LABELS={waiting:'待取件',enroute:'无人机前往',approaching:'减速对准',aligning:'稳定悬停',picking:'正在装载'};

function PerformanceProbe() {
  const {gl,camera,scene}=useThree();const last=useRef(0),samples=useRef([]),frame=useRef(0),diagnosticTime=useRef(0),objects=useRef(new Map());
  useEffect(()=>{const el=document.getElementById('render-audit'),context=gl.getContext(),debug=context.getExtension('WEBGL_debug_renderer_info');if(el)el.dataset.renderer=debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER);},[gl]);
  useFrame((_,delta)=>{
    const el=document.getElementById('render-audit');if(!el)return;
    frame.current++;
    if(performance.now()-diagnosticTime.current>250){
      el.dataset.shadow=JSON.stringify({autoUpdate:gl.shadowMap.autoUpdate,needsUpdate:gl.shadowMap.needsUpdate});el.dataset.frame=String(frame.current);el.dataset.camera=camera.position.toArray().map(n=>n.toFixed(3)).join(',');
      el.dataset.devices=JSON.stringify(['device-rover',...['1','2','3'].map(id=>'device-uav-'+id)].map(id=>{let o=objects.current.get(id);if(!o?.parent){o=scene.getObjectByName(id);if(o)objects.current.set(id,o);}return {id,position:o?.position.toArray(),yaw:o?.rotation.y,rotor:o?.getObjectByName('rotor_1')?.rotation.y,hatch:o?.getObjectByName('roof_hatch_pivot')?.rotation.z};}));
      diagnosticTime.current=performance.now();
    }
    samples.current.push(delta*1000);
    if(performance.now()-last.current>2000){const values=samples.current.sort((a,b)=>a-b),avg=values.reduce((a,b)=>a+b,0)/values.length;const groups={};scene.traverseVisible(o=>{if(!o.isMesh)return;let parent=o,key='ground';while(parent){if(parent.name.startsWith('device-')){key=parent.name;break;}if(parent.name.startsWith('campus-building')){key='buildings';break;}if(parent.name.startsWith('nature-')){key='nature';break;}parent=parent.parent;}const entry=groups[key]||(groups[key]={meshes:0,triangles:0});entry.meshes++;entry.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});el.textContent=JSON.stringify({frames:values.length,averageMs:avg,p95Ms:values[Math.floor(values.length*.95)],calls:gl.info.render.calls,triangles:gl.info.render.triangles,visibility:document.visibilityState,focused:document.hasFocus(),viewport:[gl.domElement.width,gl.domElement.height],memory:gl.info.memory,groups});samples.current=[];last.current=performance.now();}
  });return null;
}

function OrderMarker({ order, uavs, visualUAVs }) {
  const world = businessToWorld(order.x, order.y, order.z);
  const ground = campusSurfaceHeight(world.x, world.z) + 0.018;
  const balcony = order.pickupType === 'balcony';
  const markerSurface = balcony ? world.y - 0.25 : ground;
  const pulse = useRef();
  const parcelRef = useRef();
  const confirmationRef = useRef();
  const assigned = uavs.find((uav) => uav.id === order.reservedBy);
  useFrame(({ clock }) => {
    if (pulse.current) {
      pulse.current.visible = !order.completed;
      const phase = (clock.elapsedTime * 0.65 + order.id * 0.17) % 1;
      pulse.current.scale.setScalar(1 + phase * 0.55);
      pulse.current.material.opacity = 0.65 * (1 - phase);
    }
    const visual = assigned && visualUAVs.current[assigned.id];
    const progress = visual?.pickupOrderId === order.id ? visual.pickupProgress : 0;
    if (parcelRef.current) {
      const lift = pickupLift(progress);
      parcelRef.current.position.set(
        visual ? (visual.position.x - world.x) * lift : 0,
        visual ? THREE.MathUtils.lerp(world.y, visual.position.y - 0.65, lift) : world.y,
        visual ? (visual.position.z - world.z) * lift : 0
      );
    }
    if (confirmationRef.current) {
      confirmationRef.current.visible = progress >= 0.75;
      confirmationRef.current.scale.setScalar(1 + Math.max(0, progress - 0.75) * 2);
    }
  });
  return <group position={[world.x, 0, world.z]}>
    <mesh position={[0, markerSurface, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.2, 1.4, 64]} /><meshBasicMaterial color={order.completed || order.status === 'picking' ? '#24d7ad' : '#ff8a16'} transparent opacity={order.completed ? 0.35 : 0.95} depthWrite={false} />
    </mesh>
    <mesh ref={pulse} position={[0, markerSurface + 0.025, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.4, 1.55, 64]} /><meshBasicMaterial color="#ff941a" transparent depthWrite={false} />
    </mesh>
    {!balcony && <mesh position={[0, (world.y - 0.25 + ground) / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.95, world.y - 0.25 - ground, 0.8]} /><meshStandardMaterial color="#52666b" metalness={0.25} roughness={0.7} />
    </mesh>}
    <group name={`order-target-${order.id}`} position={[0, world.y, 0]} userData={{ kind: 'order', labelHeight: 1.6 }} />
    {!order.completed && <group name={`source-parcel-${order.id}`} ref={parcelRef} position={[0, world.y, 0]}><ParcelModel orderId={order.id} /></group>}
    <mesh ref={confirmationRef} visible={false} position={[0, markerSurface + 0.04, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.55, 1.8, 48]} /><meshBasicMaterial color="#21e2b0" transparent opacity={0.8} depthWrite={false} /></mesh>
  </group>;
}

function OrderMarkers({ orders, uavs, visualUAVs }) {
  return orders.map((order) => <OrderMarker key={order.id} order={order} uavs={uavs} visualUAVs={visualUAVs} />);
}

function SceneContents({snapshot,visualUAVs,running,showTrajectories,selectedAgentId,nightMode}) {
  const guideRover = {...snapshot.rover, rendezvous:snapshot.dispatch?.rendezvous};
  return <Suspense fallback={null}>
    <CampusShadowCache key={'shadow-'+snapshot.epoch} running={running}/><StaticCampus nightMode={nightMode}/>
    <MotherAsset key={'mother-'+snapshot.epoch} rover={snapshot.rover} docking={snapshot.docking} running={running} orders={snapshot.orders} elapsed={snapshot.elapsedSeconds} showTrajectories={showTrajectories} selected={selectedAgentId==='mother'}/>
    {snapshot.uavs.map((uav,index)=><DroneAsset key={snapshot.epoch+'-'+uav.id} uav={uav} index={index} visualUAVs={visualUAVs} running={running} orders={snapshot.orders} rover={guideRover} showTrajectories={showTrajectories} selected={selectedAgentId===`uav-${uav.id}`} nightMode={nightMode}/>)}
    {snapshot.dispatch?.rendezvous && <RendezvousMarker plan={snapshot.dispatch} rover={snapshot.rover}/>}
    <OrderMarkers orders={snapshot.orders} uavs={snapshot.uavs} visualUAVs={visualUAVs}/>
  </Suspense>;
}

function RendezvousMarker({plan,rover}) {
  const [x,z] = plan.rendezvous;
  const current = businessToWorld(rover.x,rover.y,0);
  const points = new Float32Array([current.x,.07,current.z,x,.07,current.z,x,.07,z]);
  return <group>
    <group name="rendezvous-target" position={[x,.08,z]} userData={{labelHeight:1}}>
      <mesh rotation-x={-Math.PI/2}><ringGeometry args={[2.4,2.65,48]}/><meshBasicMaterial color="#73c8af" transparent opacity={.85} depthWrite={false}/></mesh>
      <mesh position={[0,.5,0]}><cylinderGeometry args={[.06,.06,1,12]}/><meshBasicMaterial color="#a1e6cf"/></mesh>
    </group>
    <line><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><lineBasicMaterial color="#73c8af" transparent opacity={.65}/></line>
  </group>;
}

function MapLabelProjector({ labelContainer, visualUAVs }) {
  const { scene, camera, size } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  const objects=useRef(new Map());
  useFrame(() => {
    if (!labelContainer.current) return;
    for (const element of labelContainer.current.children) {
      const id = element.dataset.object;
      const object=findAttachedObject(scene,objects.current,id);
      if (!object) { element.style.display = 'none'; continue; }
      if (element.classList.contains('picking')) {
        const visual = visualUAVs.current[element.dataset.uav];
        const caption = element.querySelector('small');
        if (caption && visual) {
          const text = `装载 ${Math.round(visual.pickupProgress * 100)}% · UAV ${element.dataset.uav}`;
          if (caption.textContent !== text) caption.textContent = text;
        }
      }
      object.getWorldPosition(point);
      element.dataset.world=point.toArray().map(n=>n.toFixed(4)).join(',');
      point.y += object.userData.labelHeight ?? (id.startsWith('campus-building') ? BUILDING_HEIGHT + 3 : 2.3);
      const distance=point.distanceTo(camera.position);
      element.classList.toggle('detail',distance<(id.startsWith('campus-building')?115:65));
      point.project(camera);
      const visible = point.z < 1 && point.z > -1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && (element.tagName!=='BUTTON'||distance<650);
      element.style.display = visible ? (element.tagName === 'BUTTON' ? 'flex' : 'block') : 'none';
      const offsets = { 'device-rover': [0, distance>65?42:14], 'device-uav-1': [0, -36], 'device-uav-2': [25, -10], 'device-uav-3': [-25, -10] };
      const [dx, dy] = offsets[id] || [0, 0];
      element.style.transform = `translate(-50%, -100%) translate(${(point.x + 1) * size.width / 2 + dx}px, ${(1 - point.y) * size.height / 2 + dy}px)`;
    }
  });
  return null;
}

export function CampusProductionScene() {
  const simulation = useCampusBackend();
  const assets = useProgress();
  const [wide, setWide] = useState(false);
  const [cameraRequest, setCameraRequest] = useState({ mode: 'presentation' });
  const [free, setFree] = useState(false);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const orbitRef = useRef();
  const labelContainer = useRef();
  const cameraRequestRef = useRef(cameraRequest);
  const freeRef = useRef(false);
  const launchCameraTimer = useRef(null);
  const launchCameraToken = useRef(0);
  const exitFree = useCallback(() => setFree(false), []);
  useEffect(()=>{cameraRequestRef.current=cameraRequest;},[cameraRequest]);
  useEffect(()=>{freeRef.current=free;},[free]);
  useEffect(()=>()=>window.clearTimeout(launchCameraTimer.current),[]);
  const selectCamera = (mode, position, objectId) => {
    launchCameraToken.current++;
    setFree(false);
    freeRef.current=false;
    if (objectId === 'device-rover') setSelectedAgentId('mother');
    else if (objectId?.startsWith('device-uav-')) setSelectedAgentId(`uav-${objectId.slice('device-uav-'.length)}`);
    else if (mode !== 'target') setSelectedAgentId(null);
    if (mode === 'devices' && !position) {
      const rover = simulation.snapshot.rover;
      const world = businessToWorld(rover.x, rover.y, 0);
      position = new THREE.Vector3(world.x, 1.5, world.z);
    }
    const request={ mode, position, objectId };
    cameraRequestRef.current=request;
    setCameraRequest(request);
    return request;
  };
  const startMission = () => {
    if(!simulation.running&&simulation.snapshot.stats.stepCount===0){
      const rover=simulation.snapshot.rover,world=businessToWorld(rover.x,rover.y,0);
      const launchRequest=selectCamera('follow',new THREE.Vector3(world.x,1.98,world.z),'device-rover');
      const token=launchCameraToken.current;
      window.clearTimeout(launchCameraTimer.current);
      launchCameraTimer.current=window.setTimeout(()=>{
        if(!freeRef.current&&launchCameraToken.current===token&&cameraRequestRef.current===launchRequest)selectCamera('presentation');
      },6000);
    }
    simulation.start();
  };
  return (
    <div className={`campus-app ${wide ? 'wide' : ''} ${nightMode ? 'night-mode' : ''}`}>
      <output id="render-audit" hidden aria-hidden="true"/><div className="map-viewport">
      <Canvas shadows={{ type: THREE.PCFShadowMap,autoUpdate:false }} dpr={1} camera={{ position: [142, 112, 150], fov: 38, near: .5, far: 2200 }} gl={{ antialias: true,powerPreference:'high-performance', toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace }}>
        <PerformanceProbe />
        <SceneContents snapshot={simulation.snapshot} visualUAVs={simulation.visualUAVs} running={simulation.running} showTrajectories={showTrajectories} selectedAgentId={selectedAgentId} nightMode={nightMode} />
        <OrbitControls ref={orbitRef} makeDefault enabled={!free} enableDamping dampingFactor={0.08} minDistance={4} maxDistance={1800} maxPolarAngle={Math.PI / 2.02} />
        <CampusCamera request={cameraRequest} orbitRef={orbitRef} free={free} />
        <FreeCameraControls enabled={free} onExit={exitFree} />
        <MapLabelProjector key={'labels-'+simulation.snapshot.epoch} labelContainer={labelContainer} visualUAVs={simulation.visualUAVs} />
      </Canvas>
      <div ref={labelContainer} className="map-labels">
        {BUILDINGS.map(({ id, name }) => <div key={id} data-object={`campus-building-${id}`} className="map-building-label" aria-label={`${id} ${name}`}><b>{id}</b><span>{name}</span></div>)}
        {simulation.snapshot.uavs.map(({ id, phase, cargoOrderId }) => <div key={id} data-object={`device-uav-${id}`} className="device-label">UAV {id} · {PHASE_LABELS[phase] || '待命'}{cargoOrderId != null ? ` / 订单${cargoOrderId}` : ''}</div>)}
        <div data-object="device-rover" className="device-label">移动母车</div>
        {simulation.snapshot.dispatch?.rendezvous && <div data-object="rendezvous-target" className="device-label">PPO 接应点 {simulation.snapshot.dispatch.site}</div>}
        {simulation.snapshot.orders.filter((order) => !order.completed).map((order) => {
          const world = businessToWorld(order.x, order.y, order.z);
          const location = order.pickupType === 'balcony' ? `${order.buildingId} · ${order.floor}F 阳台` : '中庭';
          return <button key={`order-${order.id}`} data-object={`order-target-${order.id}`} data-uav={order.reservedBy} className={`map-target-label ${order.reservedBy?'active':''} ${order.status === 'picking' ? 'picking' : ''}`} title={`查看${location}订单 ${order.id} 的取件过程`} onClick={() => {setSelectedAgentId(order.reservedBy ? `uav-${order.reservedBy}` : null);selectCamera('target', new THREE.Vector3(world.x, world.y, world.z));}}><b>{String(order.id).padStart(2, '0')}</b><span>订单<small>{location} · {ORDER_LABELS[order.status]}{order.reservedBy ? ` · UAV ${order.reservedBy}` : ''}</small></span></button>;
        })}
      </div>
      </div>
      {assets.active&&<div className="scene-loading" role="status"><b>正在构建园区</b><span>建筑与真实景观资源 · {Math.round(assets.progress)}%</span></div>}
      <TaskConsole simulation={{...simulation,start:startMission}} selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} focus={(position,objectId) => selectCamera(objectId?'follow':'target', new THREE.Vector3(...position),objectId)} />
      <details className="asset-credit"><summary>素材与许可 ↗</summary><p><a href="https://sketchfab.com/3d-models/office-building-af9782245c134c21ae0c8df7f57077e6" target="_blank" rel="noreferrer">办公楼 · Nikitos &amp; 3130</a> / <a href="https://sketchfab.com/3d-models/quadcopter-dji-matrice-300-rtk-6677d02d66df4b73aad0d8e7bb9e3d9c" target="_blank" rel="noreferrer">无人机 · 19vitali99</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>（已改造） · 原创母车/建筑细节 ISC · <a href="https://kenney.nl/assets/nature-kit" target="_blank" rel="noreferrer">绿化 Kenney CC0（已改造）</a> · 座椅/环境 Poly Haven CC0</p></details>
      <div className="scene-expand">
        <button className={nightMode ? 'selected' : ''} aria-pressed={nightMode} onClick={() => setNightMode(value => !value)}>{nightMode ? '☼ 切到日景' : '☾ 切到夜景'}</button>
        <button className={!free && cameraRequest.mode === 'presentation' ? 'selected' : ''} onClick={() => selectCamera('presentation')}>演示视角</button>
        <button className={!free && cameraRequest.mode === 'overview' ? 'selected' : ''} onClick={() => selectCamera('overview')}>园区总览</button>
        <button className={!free && cameraRequest.mode === 'devices' ? 'selected' : ''} onClick={() => selectCamera('devices')}>设备近景</button>
        <button className={showTrajectories ? 'selected' : ''} aria-pressed={showTrajectories} title="显示设备实际尾迹和任务引导走廊" onClick={() => setShowTrajectories(value => !value)}>{showTrajectories ? '轨迹显示' : '轨迹隐藏'}</button>
        <button className={free ? 'selected' : ''} aria-pressed={free} onClick={() => setFree(!free)}>{free ? '退出漫游' : '自由漫游'}</button>
        <button onClick={() => setWide(!wide)}>{wide ? '返回监控大屏' : '展开园区场景'}</button>
      </div>
      <div className="camera-hint">{free ? 'WASD 移动 · 空格/Ctrl 或 Q/E 升降 · 右键锁定鼠标转向 · Shift 冲刺 · Esc 退出' : '左键旋转 · 右键平移 · 滚轮缩放 · 点击订单编号，近看悬停取件过程'}</div>
      {wide && <div className="wide-controls"><button onClick={startMission} disabled={simulation.loading}>开始任务</button><button onClick={simulation.pause}>暂停</button><button onClick={simulation.reset}>重置</button></div>}
    </div>
  );
}
