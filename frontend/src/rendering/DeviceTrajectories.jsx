import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { businessToWorld } from './CoordinateSystem.js';

const TRAIL_SECONDS = 3.8;
const TRAIL_CAPACITY = 80;
const TRAIL_COLORS = {
  uav: new THREE.Color('#45e5ff'),
  rover: new THREE.Color('#62f0d0')
};

function createTrailLine(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_CAPACITY * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_CAPACITY * 4), 4));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1500);
  const material = new THREE.LineBasicMaterial({
    color,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

function sampleTrail(samples, laneOffset, positionAttribute, colorAttribute, now) {
  const base = TRAIL_COLORS[laneOffset == null ? 'uav' : 'rover'];
  let count = 0;
  for (const sample of samples) {
    const age = now - sample.time;
    if (age > TRAIL_SECONDS) continue;
    const progress = samples.length > 1 ? count / (samples.length - 1) : 1;
    const freshness = THREE.MathUtils.clamp(1 - age / TRAIL_SECONDS, 0, 1);
    const alpha = Math.pow(progress, 0.7) * freshness * 0.86;
    const x = sample.x + (laneOffset == null ? 0 : Math.cos(sample.yaw) * laneOffset);
    const z = sample.z + (laneOffset == null ? 0 : -Math.sin(sample.yaw) * laneOffset);
    positionAttribute.setXYZ(count, x, sample.y, z);
    colorAttribute.setXYZW(count, base.r, base.g, base.b, alpha);
    count++;
  }
  positionAttribute.needsUpdate = true;
  colorAttribute.needsUpdate = true;
  return count;
}

function pointAlongTrail(samples, laneOffset, progress, out) {
  if (samples.length < 2) return false;
  let total = 0;
  for (let i = 1; i < samples.length; i++) total += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z, samples[i].y - samples[i - 1].y);
  if (total < 0.08) return false;
  let remaining = total * progress;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (remaining <= length || i === samples.length - 1) {
      const t = length > 0 ? THREE.MathUtils.clamp(remaining / length, 0, 1) : 1;
      const yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * t;
      out.set(THREE.MathUtils.lerp(a.x, b.x, t), THREE.MathUtils.lerp(a.y, b.y, t), THREE.MathUtils.lerp(a.z, b.z, t));
      if (laneOffset != null) {
        out.x += Math.cos(yaw) * laneOffset;
        out.z -= Math.sin(yaw) * laneOffset;
      }
      return true;
    }
    remaining -= length;
  }
  return false;
}

/** A short fading trace sampled from the rendered device pose, never from a planned path. */
export function MotionTrail({ sourceRef, grounded = false, visible = true, selected = false }) {
  const samples = useRef([]);
  const lastSample = useRef(-Infinity);
  const lines = useMemo(() => grounded
    ? [-0.44, 0.44].map(() => createTrailLine(TRAIL_COLORS.rover))
    : [createTrailLine(TRAIL_COLORS.uav)], [grounded]);
  const pulses = useMemo(() => (grounded ? [-0.44, 0.44] : [null]).map(() => ({
    geometry: new THREE.SphereGeometry(0.11, 12, 8),
    material: new THREE.MeshBasicMaterial({ color: grounded ? '#9affed' : '#b4fbff', transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false })
  })), [grounded]);
  const pulseNodes = useRef([]);
  const pulsePosition = useMemo(() => new THREE.Vector3(), []);
  const lanes = grounded ? [-0.44, 0.44] : [null];

  useEffect(() => () => {
    lines.forEach(line => { line.geometry.dispose(); line.material.dispose(); });
    pulses.forEach(pulse => { pulse.geometry.dispose(); pulse.material.dispose(); });
  }, [lines, pulses]);

  useFrame(({ clock }) => {
    const body = sourceRef.current;
    const now = clock.elapsedTime;
    const list = samples.current;
    if (visible && body) {
      const p = body.position;
      const last = list.at(-1);
      const moved = !last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.11;
      if (moved && now - lastSample.current > 0.075) {
        list.push({ x: p.x, y: grounded ? 0.12 : p.y + 0.12, z: p.z, yaw: body.rotation.y, time: now });
        lastSample.current = now;
      }
    }
    while (list.length && now - list[0].time > TRAIL_SECONDS) list.shift();
    const opacity = selected ? 1 : 0.72;
    lines.forEach((line, index) => {
      line.visible = visible && list.length > 1;
      line.material.opacity = opacity;
      const position = line.geometry.attributes.position;
      const color = line.geometry.attributes.color;
      const count = sampleTrail(list, lanes[index], position, color, now);
      line.geometry.setDrawRange(0, count);
    });
    pulses.forEach((pulse, index) => {
      const node = pulseNodes.current[index];
      if (!node) return;
      node.visible = visible && list.length > 2;
      if (node.visible) {
        const progress = (now * 0.27 + index * 0.48) % 1;
        if (pointAlongTrail(list, lanes[index], progress, pulsePosition)) {
          node.position.copy(pulsePosition);
          node.scale.setScalar(selected ? 1.18 : 0.82);
        } else node.visible = false;
      }
    });
  });

  return <group>
    {lines.map((line, i) => <primitive key={`trail-${i}`} object={line} />)}
    {pulses.map((pulse, i) => <mesh key={`pulse-${i}`} ref={node => { pulseNodes.current[i] = node; }} geometry={pulse.geometry} material={pulse.material} visible={false} />)}
  </group>;
}

const ORDER_PHASES = new Set(['takingOff', 'cruising', 'approaching', 'aligning', 'picking']);
const RETURN_PHASES = new Set(['returning', 'waitingDock', 'unloading', 'clearingBay', 'parking']);
const FLIGHT_PHASES = new Set(['takingOff', 'cruising', 'returning', 'waitingDock']);
const ROUTE_SEGMENTS = 48;
const ROUTE_MARKER_PROGRESS = [0.34, 0.68];

function createRibbon(color, opacity = 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ROUTE_SEGMENTS + 1) * 2 * 3), 3));
  const indices = [];
  for (let i = 0; i < ROUTE_SEGMENTS; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, ROUTE_SEGMENTS * 6);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1600);
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return { geometry, material };
}

function resolveTarget(uav, orders, rover) {
  if (ORDER_PHASES.has(uav.phase)) {
    const order = orders.find(item => item.id === uav.targetOrderId && !item.completed)
      || orders.find(item => item.reservedBy === uav.id && !item.completed);
    if (!order) return null;
    const point = businessToWorld(order.x, order.y, order.z);
    return { ...point, kind: 'order' };
  }
  if (RETURN_PHASES.has(uav.phase)) {
    const point = businessToWorld(rover.x, rover.y, 0);
    return { x: point.x, y: 2.15, z: point.z, kind: 'rover' };
  }
  return null;
}

/** A restrained AR mission guide from the rendered pose to the assigned goal, not a backend route. */
export function UavMissionRoute({ uav, orders, rover, visualUAVs, visible, selected = false, nightMode = false, index = 0 }) {
  // A soft outer stroke keeps the path readable against both the sky and the campus ground.
  // The center stays narrow so several aircraft do not turn into a bundle of glowing tubes.
  const halo = useMemo(() => createRibbon('#58aaa9', 0.2), []);
  const ribbon = useMemo(() => createRibbon('#176e77', 0.94), []);
  const curve = useMemo(() => new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const sample = useMemo(() => new THREE.Vector3(), []);
  const haloCenter = useMemo(() => new THREE.Vector3(), []);
  const routeCenter = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  const pulseUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const view = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  const pulse = useRef();
  const routeMarkers = useRef([]);
  const beacon = useRef();
  const pulseGeometry = useMemo(() => new THREE.OctahedronGeometry(0.24, 0), []);
  const pulseCoreGeometry = useMemo(() => new THREE.OctahedronGeometry(0.12, 0), []);
  const markerGeometry = useMemo(() => new THREE.ConeGeometry(0.15, 0.42, 4), []);
  const beaconGeometry = useMemo(() => new THREE.RingGeometry(0.38, 0.46, 32), []);
  const beaconCasingGeometry = useMemo(() => new THREE.RingGeometry(0.46, 0.51, 32), []);
  const { camera, size } = useThree();
  const haloObject = useMemo(() => new THREE.Mesh(halo.geometry, halo.material), [halo]);
  const ribbonObject = useMemo(() => new THREE.Mesh(ribbon.geometry, ribbon.material), [ribbon]);
  haloObject.frustumCulled = false;
  ribbonObject.frustumCulled = false;
  haloObject.renderOrder = 2;
  ribbonObject.renderOrder = 3;

  useEffect(() => () => {
    halo.geometry.dispose(); halo.material.dispose();
    ribbon.geometry.dispose(); ribbon.material.dispose();
    pulseGeometry.dispose(); pulseCoreGeometry.dispose(); markerGeometry.dispose(); beaconGeometry.dispose(); beaconCasingGeometry.dispose();
  }, [halo, ribbon, pulseGeometry, pulseCoreGeometry, markerGeometry, beaconGeometry, beaconCasingGeometry]);

  useFrame(({ clock }) => {
    const goal = resolveTarget(uav, orders, rover);
    const pose = visualUAVs.current[uav.id]?.position;
    const hasTarget = visible && !!goal && !!pose;
    const active = hasTarget && FLIGHT_PHASES.has(uav.phase);
    haloObject.visible = false;
    ribbonObject.visible = false;
    if (pulse.current) pulse.current.visible = false;
    routeMarkers.current.forEach(marker => { if (marker) marker.visible = false; });
    if (beacon.current) beacon.current.visible = hasTarget;
    if (!hasTarget) return;

    const start = curve.v0.set(pose.x, pose.y + 0.12, pose.z);
    target.set(goal.x, goal.y, goal.z);
    curve.v3.copy(target);
    const horizontalDistance = Math.hypot(start.x - target.x, start.z - target.z);
    const flightDistance = Math.hypot(horizontalDistance, start.y - target.y);
    const pathActive = active && flightDistance > 6;
    const cruiseArc = pathActive && horizontalDistance > 2.5;
    const lineColor = selected ? '#b179a8' : nightMode ? '#c7a1d2' : '#80608f';
    ribbon.material.color.set(lineColor);
    ribbon.material.opacity = selected ? 0.92 : nightMode ? 0.72 : 0.78;
    halo.material.color.set(selected ? '#d9b8cc' : nightMode ? '#d0b0d6' : '#ad8ab9');
    halo.material.opacity = selected ? 0.2 : nightMode ? 0.22 : 0.2;
    beaconMaterial.color.set(selected ? '#e5aa53' : nightMode ? '#d6b6dc' : '#b28bc0');
    beaconCasingMaterial.color.set(nightMode ? '#3b2a39' : '#5b4852');
    pulseMaterial.color.set(nightMode ? '#4a3150' : '#6a4d72');
    markerMaterial.color.set(selected ? '#fff0c4' : nightMode ? '#ead7ee' : '#c4a2cc');

    if (beacon.current) {
      beacon.current.position.copy(target);
      beacon.current.scale.setScalar(0.94 + Math.sin(clock.elapsedTime * 2.4 + index) * 0.06);
    }
    if (!pathActive) return;

    haloObject.visible = true;
    ribbonObject.visible = true;
    if (pulse.current) pulse.current.visible = true;
    routeMarkers.current.forEach(marker => { if (marker) marker.visible = true; });

    if (cruiseArc) {
      // Scale the lift with the trip: short hops get a small arch, long flights
      // stay below a modest ceiling instead of forming a huge campus-wide bow.
      const cruiseHeight = Math.max(start.y, target.y) + Math.min(5, 1.8 + horizontalDistance * 0.016);
      curve.v1.copy(start).lerp(target, 0.28); curve.v1.y = cruiseHeight;
      curve.v2.copy(start).lerp(target, 0.72); curve.v2.y = cruiseHeight;
    } else {
      curve.v1.copy(start).lerp(target, 0.36);
      curve.v2.copy(start).lerp(target, 0.74);
    }

    const positions = ribbon.geometry.attributes.position;
    const haloPositions = halo.geometry.attributes.position;
    for (let i = 0; i <= ROUTE_SEGMENTS; i++) {
      const t = i / ROUTE_SEGMENTS;
      curve.getPoint(t, sample);
      curve.getTangent(t, tangent);
      view.copy(camera.position).sub(sample).normalize();
      side.crossVectors(tangent, view).normalize();
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);

      const worldPerPixel = (2 * camera.position.distanceTo(sample) * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / Math.max(1, size.height);
      const haloWidth = Math.max(worldPerPixel * (selected ? 2.5 : 2.2), 0.03);
      const lineWidth = Math.max(worldPerPixel * (selected ? 1.28 : 1.12), 0.016);
      haloCenter.copy(sample).addScaledVector(view, worldPerPixel * 0.35);
      routeCenter.copy(sample).addScaledVector(view, worldPerPixel * 0.82);

      haloPositions.setXYZ(i * 2, haloCenter.x + side.x * haloWidth, haloCenter.y + side.y * haloWidth, haloCenter.z + side.z * haloWidth);
      haloPositions.setXYZ(i * 2 + 1, haloCenter.x - side.x * haloWidth, haloCenter.y - side.y * haloWidth, haloCenter.z - side.z * haloWidth);
      positions.setXYZ(i * 2, routeCenter.x + side.x * lineWidth, routeCenter.y + side.y * lineWidth, routeCenter.z + side.z * lineWidth);
      positions.setXYZ(i * 2 + 1, routeCenter.x - side.x * lineWidth, routeCenter.y - side.y * lineWidth, routeCenter.z - side.z * lineWidth);
    }
    haloPositions.needsUpdate = true;
    positions.needsUpdate = true;

    routeMarkers.current.forEach((marker, markerIndex) => {
      if (!marker) return;
      const markerT = ROUTE_MARKER_PROGRESS[markerIndex];
      curve.getPoint(markerT, sample);
      curve.getTangent(markerT, tangent);
      marker.position.copy(sample);
      marker.quaternion.setFromUnitVectors(pulseUp, tangent);
      const markerWorldPerPixel = (2 * camera.position.distanceTo(sample) * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / Math.max(1, size.height);
      marker.scale.setScalar((markerWorldPerPixel * 6.2) / 0.42);
    });

    const pulseT = (clock.elapsedTime * 0.1 + index / 3) % 1;
    curve.getPoint(pulseT, sample);
    if (pulse.current) {
      pulse.current.position.copy(sample);
      curve.getTangent(pulseT, tangent);
      pulse.current.quaternion.setFromUnitVectors(pulseUp, tangent);
      pulse.current.rotateY(clock.elapsedTime * 0.7);
      const pulseWorldPerPixel = (2 * camera.position.distanceTo(sample) * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / Math.max(1, size.height);
      pulse.current.scale.setScalar((pulseWorldPerPixel * 4.4) / 0.24);
    }
  });

  const pulseMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#6a4d72', depthTest: false, depthWrite: false, toneMapped: false }), []);
  const pulseCoreMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f6edf7', depthTest: false, depthWrite: false, toneMapped: false }), []);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ead7ee', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false }), []);
  const beaconMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d9aa62', side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }), []);
  const beaconCasingMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#365b61', side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => { pulseMaterial.dispose(); pulseCoreMaterial.dispose(); markerMaterial.dispose(); beaconMaterial.dispose(); beaconCasingMaterial.dispose(); }, [pulseMaterial, pulseCoreMaterial, markerMaterial, beaconMaterial, beaconCasingMaterial]);

  return <group>
    <primitive object={haloObject} />
    <primitive object={ribbonObject} />
    <mesh ref={pulse} geometry={pulseGeometry} material={pulseMaterial} visible={false}>
      <mesh geometry={pulseCoreGeometry} material={pulseCoreMaterial} />
    </mesh>
    {ROUTE_MARKER_PROGRESS.map((_, i) => <mesh key={`route-marker-${i}`} ref={node => { routeMarkers.current[i] = node; }} geometry={markerGeometry} material={markerMaterial} visible={false} />)}
    <group ref={beacon} visible={false}>
      <mesh geometry={beaconCasingGeometry} rotation-x={-Math.PI / 2} material={beaconCasingMaterial} />
      <mesh geometry={beaconGeometry} rotation-x={-Math.PI / 2} material={beaconMaterial} position-y={0.012} />
    </group>
  </group>;
}
