import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function CampusCamera({ request, orbitRef, free }) {
  const { camera, size,scene } = useThree();
  const followed=useRef(null);
  // Only the full-campus preset needs to fit the viewport. Resizing during
  // exploration must not send the user back to the opening viewpoint.
  const fitAspect = request.mode === 'overview' ? size.width / size.height : 0;
  useEffect(() => {
    camera.near = free ? 0.1 : 0.2;
    camera.updateProjectionMatrix();
  }, [camera, free]);
  useEffect(() => {
    const target = new THREE.Vector3(0, 12, 0);
    followed.current=null;
    if (request.mode === 'target'||request.mode==='follow') {
      target.copy(request.position);
      camera.position.copy(target).add(new THREE.Vector3(9, 7, 11));
    } else if (request.mode === 'devices') {
      target.copy(request.position ?? new THREE.Vector3(0, 1.5, 0));
      camera.position.copy(target).add(new THREE.Vector3(12, 9, 15));
    } else if (request.mode === 'presentation') {
      target.set(0, 10, -8);
      camera.position.set(142, 112, 150);
    } else {
      target.set(0, 17, 0);
      const direction = new THREE.Vector3(1, 0.95, 1).normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      for (const x of [-130, 130]) for (const y of [0, 35]) for (const z of [-115, 115]) {
        const offset = new THREE.Vector3(x, y, z).sub(target);
        distance = Math.max(distance, offset.dot(direction) + Math.max(Math.abs(offset.dot(right)) / (tanVertical * fitAspect), Math.abs(offset.dot(up)) / tanVertical));
      }
      camera.position.copy(target).addScaledVector(direction, distance * 1.07);
    }
    camera.lookAt(target);
    if (orbitRef.current) {
      orbitRef.current.target.copy(target);
      orbitRef.current.update();
    }
    camera.updateProjectionMatrix();
  }, [camera, request, fitAspect, orbitRef]);
  useFrame(()=>{if(free||request.mode!=='follow')return;const object=scene.getObjectByName(request.objectId);if(!object)return;const next=object.getWorldPosition(new THREE.Vector3());if(followed.current){const delta=next.clone().sub(followed.current);camera.position.add(delta);orbitRef.current?.target.add(delta);}followed.current=next;});

  const wasFree = useRef(free);
  const previousRequest = useRef(request);
  useEffect(() => {
    if (wasFree.current && !free && previousRequest.current === request && orbitRef.current) {
      const forward = camera.getWorldDirection(new THREE.Vector3());
      orbitRef.current.target.copy(camera.position).addScaledVector(forward, 60);
      orbitRef.current.update();
    }
    wasFree.current = free;
    previousRequest.current = request;
  }, [camera, free, orbitRef, request]);
  return null;
}

export function FreeCameraControls({ enabled, onExit }) {
  const { camera, gl } = useThree();
  const pressed = useRef(new Set());
  const movement = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
    let pointer = null;
    let lastX = 0;
    let lastY = 0;
    const clear = () => { pressed.current.clear(); pointer = null; };
    const keyDown = (event) => {
      if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Escape') { clear(); onExit(); return; }
      if (keys.has(event.code)) { event.preventDefault(); pressed.current.add(event.code); }
    };
    const keyUp = (event) => pressed.current.delete(event.code);
    const pointerDown = (event) => {
      if (event.button !== 2) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(pointer);
    };
    const pointerMove = (event) => {
      if (event.pointerId !== pointer) return;
      rotation.setFromQuaternion(camera.quaternion);
      rotation.y -= (event.clientX - lastX) * 0.003;
      rotation.x = THREE.MathUtils.clamp(rotation.x - (event.clientY - lastY) * 0.003, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
      camera.quaternion.setFromEuler(rotation);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const pointerUp = (event) => {
      if (event.pointerId === pointer) {
        if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        pointer = null;
      }
    };
    const wheel = (event) => {
      event.preventDefault();
      camera.getWorldDirection(forward);
      camera.position.addScaledVector(forward, -Math.sign(event.deltaY) * 5);
    };
    const contextMenu = (event) => event.preventDefault();
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clear);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', clear);
    canvas.addEventListener('lostpointercapture', clear);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextMenu);
    return () => {
      clear();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', clear);
      canvas.removeEventListener('lostpointercapture', clear);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
    };
  }, [enabled, camera, gl, forward, onExit]);
  useFrame((_, delta) => {
    if (!enabled || !pressed.current.size) return;
    const keys = pressed.current;
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    movement.set(0, 0, 0)
      .addScaledVector(forward, Number(keys.has('KeyW')) - Number(keys.has('KeyS')))
      .addScaledVector(right, Number(keys.has('KeyD')) - Number(keys.has('KeyA')));
    movement.y += Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 60 : 22;
    camera.position.addScaledVector(movement.normalize(), Math.min(delta, 0.05) * speed);
  });
  return null;
}
