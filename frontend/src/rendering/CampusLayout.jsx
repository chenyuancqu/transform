import React, { useMemo } from 'react';

export function campusSurfaceHeight(x, z) {
  const onVerticalRoad = Math.abs(Math.abs(x) - 66) <= 3.5 && Math.abs(z) <= 67.5;
  const onHorizontalRoad = Math.abs(Math.abs(z) - 64) <= 3.5 && Math.abs(x) <= 69.5;
  if (onHorizontalRoad) return 0.135;
  if (onVerticalRoad) return 0.13;
  if ((Math.abs(Math.abs(x) - 66) <= 6 && Math.abs(z) <= 68.5)
    || (Math.abs(Math.abs(z) - 64) <= 6 && Math.abs(x) <= 72.5)) return 0.1;
  if ((Math.abs(x) <= 3 && Math.abs(z) <= 56)
    || (Math.abs(Math.abs(x) - 32) <= 1.5 && Math.abs(z) <= 53.5)
    || (Math.abs(Math.abs(z) - 38) <= 1.5 && Math.abs(x) <= 56.5)) return 0.07;
  if (Math.abs(x) <= 50 && Math.abs(z) <= 15) return 0.06;
  return 0.02;
}

function Surface({ position, size, color, height = 0.08 }) {
  return <mesh position={[position[0], height / 2, position[1]]} receiveShadow>
    <boxGeometry args={[size[0], height, size[1]]} />
    <meshStandardMaterial color={color} roughness={0.93} />
  </mesh>;
}

function PlantingBed({ x, z, width, depth }) {
  return <group>
    <Surface position={[x, z]} size={[width + 0.6, depth + 0.6]} color="#a3a596" height={0.2} />
    <mesh position={[x, 0.23, z]} receiveShadow>
      <boxGeometry args={[width, 0.09, depth]} />
      <meshStandardMaterial color="#597851" roughness={1} />
    </mesh>
    {Array.from({ length: Math.floor(width / 2) }, (_, i) => <mesh key={i} position={[x - width / 2 + i * 2 + 1, 0.52, z]} castShadow>
      <sphereGeometry args={[0.75, 10, 8]} />
      <meshStandardMaterial color={i % 2 ? '#4c6d42' : '#628252'} roughness={1} />
    </mesh>)}
  </group>;
}

export function CampusGround() {
  const verticalRoads = [-66, 66];
  const horizontalRoads = [-64, 64];
  const pavers = useMemo(() => Array.from({ length: 22 }, (_, i) => (i - 11) * 5), []);
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[1400, 1400]} /><meshStandardMaterial color="#81917b" roughness={1} />
    </mesh>
    <Surface position={[0, 0]} size={[250, 220]} color="#65815b" height={0.02} />
    {/* A connected ring road separates the office frontage from the mission lawn. */}
    {verticalRoads.map((x) => <group key={x}>
      <Surface position={[x, 0]} size={[12, 137]} color="#b7b5aa" height={0.1} />
      <Surface position={[x, 0]} size={[7, 135]} color="#39454a" height={0.13} />
      {Array.from({ length: 22 }, (_, i) => <Surface key={i} position={[x, -62 + i * 6]} size={[0.12, 2.5]} color="#d8d3bc" height={0.15} />)}
    </group>)}
    {horizontalRoads.map((z) => <group key={z}>
      <Surface position={[0, z]} size={[145, 12]} color="#b7b5aa" height={0.1} />
      <Surface position={[0, z]} size={[139, 7]} color="#39454a" height={0.135} />
      {Array.from({ length: 24 }, (_, i) => <Surface key={i} position={[-69 + i * 6, z]} size={[2.5, 0.12]} color="#d8d3bc" height={0.15} />)}
    </group>)}
    {/* Forecourts and entrances use local paving, rather than one white slab. */}
    {[-84, 84].flatMap((z) => [-74, -25, 24, 73].map((x) => <Surface key={`${x}-${z}`} position={[x, z]} size={[44, 31]} color="#acae9e" />))}
    {[-98, 98].map((x) => <Surface key={x} position={[x, 0]} size={[44, 32]} color="#acae9e" />)}
    <Surface position={[0, 0]} size={[100, 30]} color="#bbb7a8" height={0.06} />
    <Surface position={[0, 0]} size={[6, 112]} color="#b2b6a4" height={0.07} />
    <Surface position={[-32, 0]} size={[3, 107]} color="#b2b6a4" height={0.07} />
    <Surface position={[32, 0]} size={[3, 107]} color="#b2b6a4" height={0.07} />
    <Surface position={[0, -38]} size={[113, 3]} color="#b2b6a4" height={0.07} />
    <Surface position={[0, 38]} size={[113, 3]} color="#b2b6a4" height={0.07} />
    {pavers.map((x) => <Surface key={x} position={[x, 0]} size={[0.035, 29]} color="#8e9385" height={0.075} />)}
    {[-10, -5, 0, 5, 10].map((z) => <Surface key={z} position={[0, z]} size={[100, 0.035]} color="#8e9385" height={0.075} />)}
    {[-48, 48].flatMap((x) => [-23, 23].map((z) => <PlantingBed key={`${x}-${z}`} x={x} z={z} width={20} depth={3.4} />))}
    {[-84, 84].flatMap((z) => [-50, 0, 49].map((x) => <PlantingBed key={`${x}-${z}`} x={x} z={z} width={3} depth={24} />))}
    {/* West and east crossings connect the office blocks to the pedestrian core. */}
    {[-66, 66].map((x) => Array.from({ length: 7 }, (_, i) => <Surface key={`${x}-${i}`} position={[x, -3 + i]} size={[6.3, 0.45]} color="#ece9da" height={0.16} />))}
    <Surface position={[0, -24]} size={[20, 7]} color="#9ba99b" height={0.075} />
    <Surface position={[0, -24]} size={[17, 4]} color="#6a8f87" height={0.085} />
  </group>;
}

export function CampusFurniture() {
  return <group>
    {[-40, -20, 20, 40].flatMap((x) => [-11.5, 11.5].map((z) => <group key={`${x}-${z}`} position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[2.1, 0.15, 0.55]} /><meshStandardMaterial color="#8c7456" roughness={0.83} /></mesh>
      {[-0.7, 0.7].map((leg) => <mesh key={leg} position={[leg, 0.25, 0]}><boxGeometry args={[0.12, 0.5, 0.4]} /><meshStandardMaterial color="#43534f" /></mesh>)}
    </group>))}
    {[-60, 60].flatMap((x) => [-46, -22, 0, 22, 46].map((z) => <group key={`${x}-${z}`} position={[x, 0, z]}>
      <mesh position={[0, 2.7, 0]} castShadow><cylinderGeometry args={[0.075, 0.11, 5.4, 10]} /><meshStandardMaterial color="#45534e" metalness={0.4} roughness={0.6} /></mesh>
      <mesh position={[0, 5.45, 0]}><boxGeometry args={[1.2, 0.12, 0.48]} /><meshStandardMaterial color="#d7dbd0" roughness={0.5} /></mesh>
    </group>))}
  </group>;
}

export function DronePad({ position }) {
  return <group position={position}>
    <mesh position={[0, 0.12, 0]} receiveShadow><cylinderGeometry args={[3, 3, 0.24, 48]} /><meshStandardMaterial color="#6d807a" roughness={0.86} /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.245, 0]}><ringGeometry args={[2.3, 2.4, 48]} /><meshBasicMaterial color="#cfdbd4" /></mesh>
    {[-0.7, 0.7].map((x) => <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.25, 0]}><planeGeometry args={[0.18, 1.9]} /><meshBasicMaterial color="#e5ebdd" /></mesh>)}
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.25, 0]}><planeGeometry args={[1.4, 0.18]} /><meshBasicMaterial color="#e5ebdd" /></mesh>
  </group>;
}
