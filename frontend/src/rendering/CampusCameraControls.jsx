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
    // A larger near plane gives the large campus scene useful depth precision.
    camera.near = 0.5;
    camera.updateProjectionMatrix();
  }, [camera]);
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
      target.set(-12, 10, -22);
      camera.position.set(116, 96, 128);
    } else {
      target.set(0, 18, 0);
      const direction = new THREE.Vector3(1, 1.1, 1).normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      for (const x of [-145, 145]) for (const y of [0, 32]) for (const z of [-125, 125]) {
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
  const velocity = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    const keys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyQ','KeyE','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight']);
    let pointer = null;
    let lastX = 0;
    let lastY = 0;
    let wasLocked=false,exiting=false,lockFallback=null;
    const clear = () => { pressed.current.clear(); pointer = null; velocity.set(0,0,0); };
    const exitFree = () => {
      exiting=true;clear();
      if(document.pointerLockElement===canvas)document.exitPointerLock?.();
      onExit();
    };
    const keyDown = (event) => {
      if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Escape') { event.preventDefault();exitFree();return; }
      if (keys.has(event.code)) { event.preventDefault(); pressed.current.add(event.code); }
    };
    const keyUp = (event) => pressed.current.delete(event.code);
    const pointerDown = (event) => {
      if (event.button !== 2) return;
      event.preventDefault();
      if(document.pointerLockElement===canvas){document.exitPointerLock?.();return;}
      const beginDrag=()=>{if(exiting)return;pointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;try{canvas.setPointerCapture(pointer);}catch{pointer=null;}};
      try{
        if(typeof canvas.requestPointerLock!=='function'){beginDrag();return;}
        const result=canvas.requestPointerLock();
        if(result&&typeof result.catch==='function')result.catch(beginDrag);
        lockFallback=window.setTimeout(()=>{if(document.pointerLockElement!==canvas&&pointer===null)beginDrag();},120);
      }catch{beginDrag();}
    };
    const pointerMove = (event) => {
      const locked=document.pointerLockElement===canvas;
      if (!locked&&event.pointerId !== pointer) return;
      rotation.setFromQuaternion(camera.quaternion);
      const dx=locked?event.movementX:event.clientX-lastX,dy=locked?event.movementY:event.clientY-lastY;
      rotation.y -= dx * 0.0024;
      rotation.x = THREE.MathUtils.clamp(rotation.x - dy * 0.0024, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
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
      forward.y=0;
      if(forward.lengthSq()<1e-5)forward.set(0,0,-1);
      forward.normalize();
      camera.position.addScaledVector(forward, -Math.sign(event.deltaY) * 5);
    };
    const pointerLockChange=()=>{
      const locked=document.pointerLockElement===canvas;
      if(wasLocked&&!locked&&!exiting)exitFree();
      wasLocked=locked;
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
    document.addEventListener('pointerlockchange',pointerLockChange);
    return () => {
      exiting=true;window.clearTimeout(lockFallback);
      clear();
      if(document.pointerLockElement===canvas)document.exitPointerLock?.();
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
      document.removeEventListener('pointerlockchange',pointerLockChange);
    };
  }, [enabled, camera, gl, forward, onExit, velocity]);
  useFrame((_, delta) => {
    if (!enabled) return;
    const keys = pressed.current;
    camera.getWorldDirection(forward);
    forward.y=0;
    if(forward.lengthSq()<1e-5)forward.set(0,0,-1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    const positive=code=>Number(keys.has(code)),key=(a,b)=>Math.max(positive(a),positive(b));
    movement.set(0, 0, 0)
      .addScaledVector(forward, key('KeyW','ArrowUp') - key('KeyS','ArrowDown'))
      .addScaledVector(right, key('KeyD','ArrowRight') - key('KeyA','ArrowLeft'));
    movement.y += Math.max(key('KeyE','Space'),positive('Space')) - Math.max(key('KeyQ','ControlLeft'),positive('ControlRight'));
    if(movement.lengthSq()>0)movement.normalize().multiplyScalar(keys.has('ShiftLeft')||keys.has('ShiftRight')?52:18);
    const dt=Math.min(delta,.05),ease=1-Math.exp(-8*dt);
    velocity.lerp(movement,ease);
    camera.position.addScaledVector(velocity,dt);
    camera.position.y=THREE.MathUtils.clamp(camera.position.y,1.4,900);
  });
  return null;
}
