import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  RoundedBox,
  useGLTF
} from '@react-three/drei';
import * as THREE from 'three';
import { useCampusBackend } from '../services/useCampusBackend.js';
import { TaskConsole } from '../ui/TaskConsole.jsx';
import '../ui/task-console.css';
import { businessToWorld } from './CoordinateSystem.js';
import { CAMPUS_ASSETS } from './assetManifest.js';
import { CampusGround, CampusFurniture, DronePad, campusSurfaceHeight } from './CampusLayout.jsx';
import { CampusCamera, FreeCameraControls } from './CampusCameraControls.jsx';
// Parcel easing is presentation-only; pickup timing comes from backend telemetry.
const pickupLift = progress => { const t = Math.max(0, Math.min(1, (progress - .28) / .47)); return t * t * (3 - 2 * t); };
import { ParcelModel } from './ParcelModel.jsx';

const DRONE_COLORS = ['#26c6da', '#4dd0e1', '#80deea'];
// World units are metres. The twelve-storey GLB is calibrated once, never
// shrunk per instance: shrinking a whole building also shrinks its floor height.
const BUILDING_HEIGHT = CAMPUS_ASSETS.mainBuilding.productionHeightMeters;
const DRONE_SCALE = 0.42; // ~1.45 m rotor span
const ROVER_SCALE = [0.42, 0.54, 0.54]; // ~2.18 m wide × 3.44 m long
const PHASE_LABELS = { idle: '待命', cruising: '前往取件', approaching: '减速对准', aligning: '稳定悬停', picking: '装载包裹', returning: '携货返航', unloading: '母车入舱' };
const ORDER_LABELS = { waiting: '待取件', enroute: '无人机前往', approaching: '减速对准', aligning: '稳定悬停', picking: '正在装载' };
const BUILDINGS = [
  { id: 'A1', name: '主研发中心', position: [-74, 0, -84] },
  { id: 'A2', name: '创新研发楼', position: [-25, 0, -84] },
  { id: 'A3', name: '智能技术楼', position: [24, 0, -84] },
  { id: 'A4', name: '数字实验楼', position: [73, 0, -84] },
  { id: 'B1', name: '企业研发楼', position: [-74, 0, 84], rotation: [0, Math.PI, 0] },
  { id: 'B2', name: '协同创新楼', position: [-25, 0, 84], rotation: [0, Math.PI, 0] },
  { id: 'B3', name: '产业服务楼', position: [24, 0, 84], rotation: [0, Math.PI, 0] },
  { id: 'B4', name: '综合办公楼', position: [73, 0, 84], rotation: [0, Math.PI, 0] },
  { id: 'C1', name: '西区研发楼', position: [-98, 0, 0] },
  { id: 'C2', name: '东区研发楼', position: [98, 0, 0], rotation: [0, Math.PI, 0] }
];

function PerformanceProbe() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (import.meta.env.DEV) window.__campusR3F = { renderer: gl, scene, camera };
  }, [gl, scene, camera]);
  return null;
}

function BuildingAsset({ position, height = BUILDING_HEIGHT, name, id, castShadow = true, rotation = [0, 0, 0] }) {
  const { scene } = useGLTF(CAMPUS_ASSETS.mainBuilding.url);
  const asset = useMemo(() => scene.clone(true), [scene]);
  const dimensions = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    return { factor: height / size.y, offset: [-center.x, -bounds.min.y, -center.z] };
  }, [scene, height]);
  useEffect(() => {
    asset.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = castShadow;
        node.receiveShadow = true;
      }
    });
  }, [asset, castShadow]);
  return <group position={position} rotation={rotation} name={`campus-building-${id}`} userData={{ kind: 'building', height }}>
    <group scale={dimensions.factor}><primitive object={asset} position={dimensions.offset} /></group>
  </group>;
}

function Tree({ position, scale = 1, variant = 0 }) {
  const crown = variant % 2 === 0 ? '#547b63' : '#6d8e68';
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 2.1, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.48, 4.2, 8]} />
        <meshStandardMaterial color="#735641" roughness={0.92} />
      </mesh>
      <mesh position={[0, 4.7, 0]} castShadow>
        <dodecahedronGeometry args={[2.35, 1]} />
        <meshStandardMaterial color={crown} roughness={0.9} />
      </mesh>
      <mesh position={[0.65, 5.55, 0.25]} castShadow>
        <dodecahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial color="#789b70" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Landscape() {
  const trees = useMemo(() => [
    ...[-112, 112].flatMap((x) => [-77, -48, -28, 28, 48, 77].map((z) => [x, 0, z, 0.95])),
    ...[-48, 48].flatMap((x) => [-43, -28, 28, 43].map((z) => [x, 0, z, 0.85])),
    ...[-94, 94].flatMap((z) => [-49, 0, 49].map((x) => [x, 0, z, 0.92])),
    ...[-18, 18].flatMap((x) => [-34, 34].map((z) => [x, 0, z, 0.8]))
  ], []);
  return (
    <group>
      {trees.map(([x, y, z, scale], index) => <Tree key={index} position={[x, y, z]} scale={scale} variant={index} />)}
      {[-34, 34].map((x) => (
        <group key={x} position={[x, 0, 35]}>
          <mesh position={[0, 1.2, 0]} castShadow><sphereGeometry args={[1.35, 16, 12]} /><meshStandardMaterial color="#718e6d" roughness={0.92} /></mesh>
          <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[1.4, 1.4, 0.35, 20]} /><meshStandardMaterial color="#a4b8a1" roughness={0.85} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Drone({ uav, index, visualUAVs, running, speed }) {
  const bodyRef = useRef();
  const initialWorld = businessToWorld(uav.x, uav.y, uav.z);
  const initialPosition = useRef([initialWorld.x, initialWorld.y, initialWorld.z]);
  const animation = useRef({ orderId: null, pickupProgress: 0, unloadProgress: 0 });
  const cableRef = useRef();
  const clawRef = useRef();
  const cargoRef = useRef();
  const rotorRefs = useRef([]);
  const trailRef = useRef();
  const trailPoints = useRef([]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const trailObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(45 * 3), 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({ color: DRONE_COLORS[index], transparent: true, opacity: 0.42 });
    return new THREE.Line(geometry, material);
  }, [index]);

  useEffect(() => () => { trailObject.geometry.dispose(); trailObject.material.dispose(); }, [trailObject]);

  useFrame((_, delta) => {
    const world = businessToWorld(uav.x, uav.y, uav.z);
    target.set(world.x, world.y, world.z);
    if (!bodyRef.current) return;
    const blend = 1 - Math.exp(-delta * 12);
    const previousX = bodyRef.current.position.x;
    const previousY = bodyRef.current.position.y;
    const previousZ = bodyRef.current.position.z;
    bodyRef.current.position.lerp(target, blend);
    const anim = animation.current;
    anim.orderId = uav.phase === 'picking' ? uav.targetOrderId : null;
    anim.pickupProgress = uav.phase === 'picking' ? uav.pickupProgress : 0;
    anim.unloadProgress = uav.phase === 'unloading' ? uav.unloadProgress : 0;
    let cableLength = 0.04;
    if (uav.phase === 'picking') {
      const extension = Math.min(1, anim.pickupProgress / 0.28);
      cableLength = THREE.MathUtils.lerp(0.04, 0.42, extension) - pickupLift(anim.pickupProgress) * 0.3;
    } else if (uav.cargoOrderId != null) cableLength = 0.12 + anim.unloadProgress * 0.1;
    if (cableRef.current) {
      cableRef.current.position.y = -(0.28 + cableLength / 2) / DRONE_SCALE;
      cableRef.current.scale.y = cableLength / DRONE_SCALE;
    }
    if (clawRef.current) clawRef.current.position.y = -(0.28 + cableLength) / DRONE_SCALE;
    if (cargoRef.current) {
      cargoRef.current.position.y = -(0.65 + anim.unloadProgress * 0.1) / DRONE_SCALE;
      cargoRef.current.visible = anim.unloadProgress < 0.96;
    }
    visualUAVs.current[uav.id] = {
      position: { x: bodyRef.current.position.x, y: bodyRef.current.position.y, z: bodyRef.current.position.z },
      speed: Math.hypot(bodyRef.current.position.x - previousX, bodyRef.current.position.y - previousY, bodyRef.current.position.z - previousZ) / Math.max(delta, 0.001),
      pickupOrderId: anim.orderId, pickupProgress: anim.pickupProgress,
      cargoOrderId: uav.cargoOrderId, unloadProgress: anim.unloadProgress
    };
    rotorRefs.current.forEach((rotor) => { if (rotor) rotor.rotation.y += running ? delta * 18 : 0; });

    const last = trailPoints.current[trailPoints.current.length - 1];
    if (!last || last.distanceTo(bodyRef.current.position) > 0.18) trailPoints.current.push(bodyRef.current.position.clone());
    if (trailPoints.current.length > 45) trailPoints.current.shift();
    if (trailRef.current) {
      const positions = trailRef.current.geometry.attributes.position.array;
      trailPoints.current.forEach((point, pointIndex) => {
        positions[pointIndex * 3] = point.x;
        positions[pointIndex * 3 + 1] = point.y;
        positions[pointIndex * 3 + 2] = point.z;
      });
      trailRef.current.geometry.setDrawRange(0, trailPoints.current.length);
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const rotorPositions = [[1.05, 0.1, 1.05], [-1.05, 0.1, 1.05], [1.05, 0.1, -1.05], [-1.05, 0.1, -1.05]];
  return (
    <group>
      <primitive ref={trailRef} object={trailObject} />
      <group ref={bodyRef} name={`device-uav-${uav.id}`} position={initialPosition.current} scale={DRONE_SCALE}>
        <RoundedBox args={[1.8, 0.5, 1.25]} radius={0.24} smoothness={4} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color="#26343c" metalness={0.72} roughness={0.23} />
        </RoundedBox>
        <RoundedBox args={[1.05, 0.25, 0.78]} radius={0.16} smoothness={3} position={[0, 0.34, 0]} castShadow>
          <meshStandardMaterial color={DRONE_COLORS[index]} metalness={0.5} roughness={0.2} emissive={DRONE_COLORS[index]} emissiveIntensity={0.18} />
        </RoundedBox>
        <mesh position={[0, -0.42, 0]} castShadow><cylinderGeometry args={[0.32, 0.42, 0.55, 16]} /><meshStandardMaterial color="#101b22" metalness={0.62} roughness={0.26} /></mesh>
        <mesh position={[0, -0.72, 0]}><sphereGeometry args={[0.14, 12, 8]} /><meshBasicMaterial color="#d5ffff" /></mesh>
        <mesh position={[0, 0.02, 0]} rotation-y={Math.PI / 4}><boxGeometry args={[0.14, 0.12, 3.25]} /><meshStandardMaterial color="#425159" metalness={0.72} roughness={0.3} /></mesh>
        <mesh position={[0, 0.02, 0]} rotation-y={-Math.PI / 4}><boxGeometry args={[0.14, 0.12, 3.25]} /><meshStandardMaterial color="#425159" metalness={0.72} roughness={0.3} /></mesh>
        {rotorPositions.map((position, rotorIndex) => (
          <group key={rotorIndex} ref={(node) => { rotorRefs.current[rotorIndex] = node; }} position={position}>
            <mesh castShadow><cylinderGeometry args={[0.28, 0.28, 0.12, 16]} /><meshStandardMaterial color="#1b282f" metalness={0.65} roughness={0.24} /></mesh>
            <mesh rotation-y={Math.PI / 4}><boxGeometry args={[1.35, 0.035, 0.1]} /><meshBasicMaterial color={DRONE_COLORS[index]} transparent opacity={0.8} /></mesh>
            <mesh rotation-y={-Math.PI / 4}><boxGeometry args={[1.35, 0.035, 0.1]} /><meshBasicMaterial color="#d8ffff" transparent opacity={0.5} /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.3, 0.64]}><sphereGeometry args={[0.16, 12, 8]} /><meshBasicMaterial color="#aafcff" /></mesh>
        <mesh ref={cableRef}><cylinderGeometry args={[0.016, 0.016, 1, 8]} /><meshStandardMaterial color="#d1d8d7" metalness={0.7} roughness={0.3} /></mesh>
        <group ref={clawRef}>
          <mesh><boxGeometry args={[1.8, 0.08, 0.22]} /><meshStandardMaterial color="#667b83" metalness={0.7} roughness={0.3} /></mesh>
          {[-1, 1].map((side) => <mesh key={side} position={[side * 0.85, -0.1, 0]}><boxGeometry args={[0.08, 0.35, 0.22]} /><meshStandardMaterial color="#e1c186" metalness={0.55} roughness={0.4} /></mesh>)}
        </group>
        {uav.cargoOrderId != null && <group name={`cargo-parcel-uav-${uav.id}`} ref={cargoRef} scale={1 / DRONE_SCALE} position={[0, -0.65 / DRONE_SCALE, 0]}><ParcelModel orderId={uav.cargoOrderId} /></group>}
      </group>
    </group>
  );
}

function Rover({ rover }) {
  const bodyRef = useRef();
  const target = useMemo(() => new THREE.Vector3(), []);
  const trailRef = useRef();
  const trailPoints = useRef([]);
  const trailObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(55 * 3), 3));
    geometry.setDrawRange(0, 0);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#4d7e87', transparent: true, opacity: 0.32 }));
  }, []);
  useEffect(() => () => { trailObject.geometry.dispose(); trailObject.material.dispose(); }, [trailObject]);

  useFrame((_, delta) => {
    const world = businessToWorld(rover.x, rover.y, 0);
    target.set(world.x, campusSurfaceHeight(world.x, world.z) + 0.054, world.z);
    if (!bodyRef.current) return;
    const previous = bodyRef.current.position.clone();
    bodyRef.current.position.lerp(target, 1 - Math.exp(-delta * 2.2));
    const dx = bodyRef.current.position.x - previous.x;
    const dz = bodyRef.current.position.z - previous.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.002) bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, Math.atan2(dx, dz), 0.12);
    const last = trailPoints.current[trailPoints.current.length - 1];
    if (!last || last.distanceTo(bodyRef.current.position) > 0.15) trailPoints.current.push(bodyRef.current.position.clone());
    if (trailPoints.current.length > 55) trailPoints.current.shift();
    if (trailRef.current) {
      const positions = trailRef.current.geometry.attributes.position.array;
      trailPoints.current.forEach((point, pointIndex) => { positions[pointIndex * 3] = point.x; positions[pointIndex * 3 + 1] = 0.08; positions[pointIndex * 3 + 2] = point.z; });
      trailRef.current.geometry.setDrawRange(0, trailPoints.current.length);
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  return (
    <group>
      <primitive ref={trailRef} object={trailObject} />
      <group ref={bodyRef} name="device-rover" scale={ROVER_SCALE}>
        <RoundedBox args={[4.6, 1.45, 6.3]} radius={0.5} smoothness={4} position={[0, 1.05, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#405d66" metalness={0.58} roughness={0.28} />
        </RoundedBox>
        <RoundedBox args={[3.75, 0.55, 4.9]} radius={0.22} smoothness={3} position={[0, 1.95, 0]} castShadow>
          <meshStandardMaterial color="#8ec6c8" metalness={0.44} roughness={0.18} emissive="#1a555c" emissiveIntensity={0.12} />
        </RoundedBox>
        <mesh position={[0, 2.33, 0]} castShadow><cylinderGeometry args={[2.05, 2.05, 0.25, 32]} /><meshStandardMaterial color="#d6efe8" metalness={0.75} roughness={0.18} /></mesh>
        <mesh position={[0, 2.48, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[2.05, 0.08, 10, 48]} /><meshBasicMaterial color="#82f0dd" transparent opacity={0.9} /></mesh>
        {[[-2.35, 0.72, 2.1], [2.35, 0.72, 2.1], [-2.35, 0.72, -2.1], [2.35, 0.72, -2.1]].map((position, index) => (
          <mesh key={index} position={position} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[0.82, 0.82, 0.48, 20]} /><meshStandardMaterial color="#18252b" metalness={0.45} roughness={0.65} /></mesh>
        ))}
        <mesh position={[0, 1.25, 3.18]}><boxGeometry args={[2.1, 0.5, 0.08]} /><meshBasicMaterial color="#b6ffff" transparent opacity={0.75} /></mesh>
      </group>
    </group>
  );
}

function OrderMarker({ order, uavs, visualUAVs }) {
  const world = businessToWorld(order.x, order.y, order.z);
  const ground = campusSurfaceHeight(world.x, world.z) + 0.018;
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
    <mesh position={[0, ground, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.2, 1.4, 64]} /><meshBasicMaterial color={order.completed || order.status === 'picking' ? '#24d7ad' : '#ff8a16'} transparent opacity={order.completed ? 0.35 : 0.95} depthWrite={false} />
    </mesh>
    <mesh ref={pulse} position={[0, ground + 0.025, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.4, 1.55, 64]} /><meshBasicMaterial color="#ff941a" transparent depthWrite={false} />
    </mesh>
    <mesh position={[0, (world.y - 0.25 + ground) / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.95, world.y - 0.25 - ground, 0.8]} /><meshStandardMaterial color="#52666b" metalness={0.25} roughness={0.7} />
    </mesh>
    <group name={`order-target-${order.id}`} position={[0, world.y, 0]} userData={{ kind: 'order', labelHeight: 1.6 }} />
    {!order.completed && <group name={`source-parcel-${order.id}`} ref={parcelRef} position={[0, world.y, 0]}><ParcelModel orderId={order.id} /></group>}
    <mesh ref={confirmationRef} visible={false} position={[0, ground + 0.04, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.55, 1.8, 48]} /><meshBasicMaterial color="#21e2b0" transparent opacity={0.8} depthWrite={false} /></mesh>
  </group>;
}

function OrderMarkers({ orders, uavs, visualUAVs }) {
  return orders.map((order) => <OrderMarker key={order.id} order={order} uavs={uavs} visualUAVs={visualUAVs} />);
}

function SceneContents({ snapshot, visualUAVs, running, speed }) {
  return <>
    <CampusGround />
    <CampusFurniture />
    <Suspense fallback={null}>
      {BUILDINGS.map((building) => <BuildingAsset key={building.id} {...building} />)}
    </Suspense>
    <Landscape />
    <DronePad position={[-12, 0, 0]} />
    <DronePad position={[12, 0, 0]} />
    {snapshot.uavs.length > 0 && <Rover key={snapshot.epoch} rover={snapshot.rover} />}
    {snapshot.uavs.map((uav, index) => <Drone key={`${snapshot.epoch}-${uav.id}`} uav={uav} index={index} visualUAVs={visualUAVs} running={running} speed={speed} />)}
    <OrderMarkers orders={snapshot.orders} uavs={snapshot.uavs} visualUAVs={visualUAVs} />
  </>;
}

function MapLabelProjector({ labelContainer, visualUAVs }) {
  const { scene, camera, size } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!labelContainer.current) return;
    for (const element of labelContainer.current.children) {
      const id = element.dataset.object;
      const object = scene.getObjectByName(id);
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
      point.y += object.userData.labelHeight ?? (id.startsWith('campus-building') ? BUILDING_HEIGHT + 3 : 2.3);
      point.project(camera);
      const visible = point.z < 1 && point.z > -1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1;
      element.style.display = visible ? (element.tagName === 'BUTTON' ? 'flex' : 'block') : 'none';
      const offsets = { 'device-rover': [0, 14], 'device-uav-1': [0, -36], 'device-uav-2': [25, -10], 'device-uav-3': [-25, -10] };
      const [dx, dy] = offsets[id] || [0, 0];
      element.style.transform = `translate(-50%, -100%) translate(${(point.x + 1) * size.width / 2 + dx}px, ${(1 - point.y) * size.height / 2 + dy}px)`;
    }
  });
  return null;
}

export function CampusProductionScene() {
  const simulation = useCampusBackend();
  const [wide, setWide] = useState(false);
  const [cameraRequest, setCameraRequest] = useState({ mode: 'presentation' });
  const [free, setFree] = useState(false);
  const orbitRef = useRef();
  const labelContainer = useRef();
  const exitFree = useCallback(() => setFree(false), []);
  const selectCamera = (mode, position) => {
    setFree(false);
    if (mode === 'devices' && !position) {
      const rover = simulation.snapshot.rover;
      const world = businessToWorld(rover.x, rover.y, 0);
      position = new THREE.Vector3(world.x, 1.5, world.z);
    }
    setCameraRequest({ mode, position });
  };
  return (
    <div className={`campus-app ${wide ? 'wide' : ''}`}>
      <div className="map-viewport">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.75]} camera={{ position: [160, 125, 175], fov: 38, near: 2, far: 1800 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95, outputColorSpace: THREE.SRGBColorSpace }}>
        <PerformanceProbe />
        <color attach="background" args={['#c7d4c5']} />
        <fog attach="fog" args={['#c7d4c5', 650, 1300]} />
        <ambientLight intensity={0.6} color="#fff5e9" />
        <hemisphereLight intensity={0.8} color="#e0efff" groundColor="#657458" />
        <directionalLight castShadow position={[-90, 140, 80]} intensity={2.2} shadow-mapSize={[4096, 4096]} shadow-camera-left={-165} shadow-camera-right={165} shadow-camera-top={165} shadow-camera-bottom={-165} shadow-camera-far={450} shadow-bias={-0.00015} />
        <SceneContents snapshot={simulation.snapshot} visualUAVs={simulation.visualUAVs} running={simulation.running} speed={simulation.speed} />
        <OrbitControls ref={orbitRef} makeDefault enabled={!free} enableDamping dampingFactor={0.08} minDistance={4} maxDistance={900} maxPolarAngle={Math.PI / 2.02} />
        <CampusCamera request={cameraRequest} orbitRef={orbitRef} free={free} />
        <FreeCameraControls enabled={free} onExit={exitFree} />
        <MapLabelProjector labelContainer={labelContainer} visualUAVs={simulation.visualUAVs} />
      </Canvas>
      <div ref={labelContainer} className="map-labels">
        {BUILDINGS.map(({ id, name }) => <div key={id} data-object={`campus-building-${id}`} className="map-building-label"><b>{id}</b> {name}</div>)}
        {simulation.snapshot.uavs.map(({ id, phase, cargoOrderId }) => <div key={id} data-object={`device-uav-${id}`} className="device-label">UAV {id} · {PHASE_LABELS[phase]}{cargoOrderId != null ? ` / 包裹${cargoOrderId}` : ''}</div>)}
        <div data-object="device-rover" className="device-label">移动母车</div>
        {simulation.snapshot.orders.filter((order) => !order.completed).map((order) => {
          const world = businessToWorld(order.x, order.y, order.z);
          return <button key={`order-${order.id}`} data-object={`order-target-${order.id}`} data-uav={order.reservedBy} className={`map-target-label ${order.status === 'picking' ? 'picking' : ''}`} title={`查看包裹 ${order.id} 的取件过程`} onClick={() => selectCamera('target', new THREE.Vector3(world.x, world.y, world.z))}><b>{String(order.id).padStart(2, '0')}</b><span>快递包裹<small>{ORDER_LABELS[order.status]}{order.reservedBy ? ` · UAV ${order.reservedBy}` : ''} · 点击查看</small></span></button>;
        })}
      </div>
      </div>
      <TaskConsole simulation={simulation} focus={(position) => selectCamera('target', new THREE.Vector3(...position))} />
      <div className="asset-credit">建筑模型：<a href="https://sketchfab.com/3d-models/modern-tower-office-apartment-house-home-a057bf3379b24c23a18a82ec884e4f04" target="_blank" rel="noreferrer">zigurat architecture studio</a> · CC BY 4.0 · 已调整尺度</div>
      <div className="scene-expand">
        <button className={!free && cameraRequest.mode === 'presentation' ? 'selected' : ''} onClick={() => selectCamera('presentation')}>演示视角</button>
        <button className={!free && cameraRequest.mode === 'overview' ? 'selected' : ''} onClick={() => selectCamera('overview')}>园区总览</button>
        <button className={!free && cameraRequest.mode === 'devices' ? 'selected' : ''} onClick={() => selectCamera('devices')}>设备近景</button>
        <button className={free ? 'selected' : ''} aria-pressed={free} onClick={() => setFree(!free)}>{free ? '退出漫游' : '自由漫游'}</button>
        <button onClick={() => setWide(!wide)}>{wide ? '返回监控大屏' : '展开园区场景'}</button>
      </div>
      <div className="camera-hint">{free ? 'WASD 移动 · Q/E 降低/升高 · 按住右键转向 · Shift 加速 · Esc 退出' : '左键旋转 · 右键平移 · 滚轮缩放 · 点击包裹编号，近看悬停取件过程'}</div>
      {wide && <div className="wide-controls"><button onClick={simulation.start} disabled={simulation.loading}>开始任务</button><button onClick={simulation.pause}>暂停</button><button onClick={simulation.reset}>重置</button></div>}
    </div>
  );
}

useGLTF.preload(CAMPUS_ASSETS.mainBuilding.url);
