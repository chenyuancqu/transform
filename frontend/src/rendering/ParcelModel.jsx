import React, { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// Original procedural model, in metres: 0.65 × 0.50 × 0.50.
// The printed label and tape are authored here, with no external asset licence.
export function ParcelModel({ orderId }) {
  const label = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6f2e6'; ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = '#282b2b';
    ctx.font = 'bold 42px sans-serif'; ctx.fillText('EXPRESS', 25, 58);
    ctx.font = '24px monospace'; ctx.fillText(`NX-${String(orderId).padStart(5, '0')}`, 25, 98);
    ctx.lineWidth = 3; ctx.strokeRect(22, 114, 466, 74);
    ctx.font = 'bold 42px sans-serif'; ctx.fillText('↑ ↑', 39, 167);
    ctx.font = '20px sans-serif'; ctx.fillText('HANDLE WITH CARE', 150, 158);
    let x = 26;
    for (let i = 0; i < 80; i++) {
      const width = 2 + ((i * 17 + orderId * 7) % 5);
      if (i % 2 === 0) ctx.fillRect(x, 208, width, 70);
      x += width + 1;
    }
    ctx.font = '18px monospace'; ctx.fillText(`CAMPUS PICKUP / ${String(orderId).padStart(2, '0')}`, 25, 304);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [orderId]);
  useEffect(() => () => label.dispose(), [label]);
  return <group name={`parcel-model-${orderId}`}>
    <RoundedBox args={[0.65, 0.5, 0.5]} radius={0.012} smoothness={3} castShadow receiveShadow>
      <meshStandardMaterial color="#b58a52" roughness={0.94} />
    </RoundedBox>
    <mesh position={[0, 0.252, 0]}><boxGeometry args={[0.105, 0.004, 0.5]} /><meshStandardMaterial color="#d6b078" roughness={0.6} /></mesh>
    <mesh position={[0, 0, 0.252]}><boxGeometry args={[0.105, 0.5, 0.004]} /><meshStandardMaterial color="#c9a06a" roughness={0.64} /></mesh>
    <mesh position={[0, 0, -0.252]}><boxGeometry args={[0.105, 0.5, 0.004]} /><meshStandardMaterial color="#c9a06a" roughness={0.64} /></mesh>
    <mesh position={[0.3255, 0, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[0.34, 0.24]} /><meshStandardMaterial map={label} roughness={0.82} /></mesh>
    <mesh position={[0.08, 0.254, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.31, 0.195]} /><meshStandardMaterial map={label} roughness={0.82} /></mesh>
    <mesh position={[0, 0.2525, 0]}><boxGeometry args={[0.65, 0.001, 0.004]} /><meshStandardMaterial color="#87633d" roughness={1} /></mesh>
  </group>;
}
