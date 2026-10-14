/**
 * React Three Fiber 版本样板场景
 * 使用R3F生态系统提供的高级渲染能力
 */

import React, { useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  Sky,
  ContactShadows,
  PerspectiveCamera,
  useTexture
} from '@react-three/drei';
import * as THREE from 'three';

// 游戏级配色
const COLORS = {
  buildingBlue: '#318EC9',
  buildingCyan: '#38B9AE',
  buildingCream: '#F4E5C7',
  buildingOrange: '#F5A352',
  roofDark: '#295B86',
  grass: '#59C86A',
  grassDark: '#38A95A',
  treeCrown: '#2FAE5B',
  treeCrownLight: '#85DA72',
  road: '#8798A6',
  sidewalk: '#E8DCC8',
  window: '#6EC4F5'
};

// 地面组件
function Ground() {
  // 创建鲜艳草地纹理
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 基础鲜艳绿色
  ctx.fillStyle = '#59C86A';
  ctx.fillRect(0, 0, 512, 512);

  // 添加深浅变化
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rand = Math.random();

    if (rand < 0.3) {
      ctx.fillStyle = '#38A95A'; // 深绿
    } else if (rand < 0.6) {
      ctx.fillStyle = '#6DD87A'; // 亮绿
    } else {
      ctx.fillStyle = '#4ABC65'; // 中绿
    }

    const size = 1 + Math.random() * 2;
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(15, 15);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial
        map={texture}
        color="#70D97A"
        roughness={0.95}
      />
    </mesh>
  );
}

// 办公楼组件
function OfficeBuilding({ position }) {
  const floors = 7;
  const floorHeight = 4;
  const width = 20;
  const depth = 15;

  return (
    <group position={position}>
      {/* 楼层 */}
      {Array.from({ length: floors }).map((_, i) => {
        const currentWidth = width - (i > 4 ? 2 : 0);
        const currentDepth = depth - (i > 4 ? 1.5 : 0);
        const y = i * floorHeight + floorHeight / 2;

        return (
          <group key={i}>
            <mesh position={[0, y, 0]} castShadow receiveShadow>
              <boxGeometry args={[currentWidth, floorHeight, currentDepth]} />
              <meshStandardMaterial
                color={COLORS.buildingBlue}
                roughness={0.65}
                metalness={0.25}
              />
            </mesh>

            {/* 白色分隔线 */}
            {i < floors - 1 && (
              <mesh position={[0, (i + 1) * floorHeight, 0]}>
                <boxGeometry args={[currentWidth + 0.4, 0.2, currentDepth + 0.4]} />
                <meshStandardMaterial color="#ffffff" roughness={0.8} />
              </mesh>
            )}

            {/* 前面窗户 */}
            {Array.from({ length: 5 }).map((_, j) => {
              const x = -currentWidth/2 + 3 + j * 3.5;
              return (
                <mesh
                  key={`window-${j}`}
                  position={[x, y, currentDepth/2 + 0.02]}
                >
                  <planeGeometry args={[1.4, 2]} />
                  <meshStandardMaterial
                    color={COLORS.window}
                    emissive={COLORS.window}
                    emissiveIntensity={0.2}
                    roughness={0.2}
                    metalness={0.5}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* 屋顶 */}
      <mesh position={[0, floors * floorHeight + 1.1, 0]} castShadow>
        <boxGeometry args={[width + 1.5, 2.2, depth + 1.5]} />
        <meshStandardMaterial
          color={COLORS.roofDark}
          roughness={0.75}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

// 控制中心组件
function ControlCenter({ position }) {
  return (
    <group position={position}>
      {/* 基座 */}
      <mesh position={[0, 7.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[18, 15, 18]} />
        <meshStandardMaterial
          color={COLORS.buildingCyan}
          roughness={0.65}
          metalness={0.2}
        />
      </mesh>

      {/* 塔楼 */}
      <mesh position={[0, 17.5, 0]} castShadow>
        <cylinderGeometry args={[6, 6.5, 5, 16]} />
        <meshStandardMaterial
          color={COLORS.buildingCyan}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      {/* 屋顶 */}
      <mesh position={[0, 20.5, 0]} castShadow>
        <cylinderGeometry args={[5, 6, 2, 16]} />
        <meshStandardMaterial
          color={COLORS.roofDark}
          roughness={0.75}
        />
      </mesh>

      {/* 窗户 */}
      {[0, 90, 180, 270].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * 9.2;
        const z = Math.sin(rad) * 9.2;

        return (
          <mesh
            key={i}
            position={[x, 7.5, z]}
            rotation={[0, -rad, 0]}
          >
            <planeGeometry args={[1.6, 2.2]} />
            <meshStandardMaterial
              color={COLORS.window}
              emissive={COLORS.window}
              emissiveIntensity={0.2}
              roughness={0.2}
              metalness={0.5}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// 树木组件
function Tree({ position }) {
  return (
    <group position={position}>
      {/* 树干 */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.7, 5, 8]} />
        <meshStandardMaterial
          color="#6B4423"
          roughness={0.96}
        />
      </mesh>

      {/* 树冠 - 3层 */}
      {[0, 1, 2].map((i) => {
        const colors = [COLORS.treeCrown, '#4ABC65', COLORS.treeCrownLight];
        const radius = 3.5 - i * 0.7;

        return (
          <mesh
            key={i}
            position={[0, 6 + i * 1.4, 0]}
            castShadow
            receiveShadow
          >
            <sphereGeometry args={[radius, 10, 10]} />
            <meshStandardMaterial
              color={colors[i]}
              roughness={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// 道路系统
function Roads() {
  return (
    <group>
      {/* 主路 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[130, 14]} />
        <meshStandardMaterial color={COLORS.road} roughness={0.88} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[14, 130]} />
        <meshStandardMaterial color={COLORS.road} roughness={0.88} />
      </mesh>

      {/* 人行道 */}
      {[-8, 8].map((offset, i) => (
        <React.Fragment key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, offset]} receiveShadow>
            <planeGeometry args={[130, 3]} />
            <meshStandardMaterial color={COLORS.sidewalk} roughness={0.92} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset, 0.03, 0]} receiveShadow>
            <planeGeometry args={[3, 130]} />
            <meshStandardMaterial color={COLORS.sidewalk} roughness={0.92} />
          </mesh>
        </React.Fragment>
      ))}

      {/* 白色标线 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[130, 0.3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[0.3, 130]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

// 停机坪
function LandingPad() {
  return (
    <group position={[0, 0.05, 22]}>
      {/* 主圆盘 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[11, 32]} />
        <meshStandardMaterial
          color="#4A9FD8"
          emissive="#4A8AC8"
          emissiveIntensity={0.1}
          roughness={0.55}
          metalness={0.3}
        />
      </mesh>

      {/* 白色环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[10, 10.6, 32]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>

      {/* H标记 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[4.5, 0.7]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.9, 0.02, 0]}>
        <planeGeometry args={[0.7, 3.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.9, 0.02, 0]}>
        <planeGeometry args={[0.7, 3.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

// 灌木
function Bushes() {
  const bushes = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 32 + Math.random() * 10;
    return {
      position: [Math.cos(angle) * radius, 0.7, Math.sin(angle) * radius],
      scale: 1.1 + Math.random() * 0.5
    };
  });

  return (
    <>
      {bushes.map((bush, i) => (
        <mesh key={i} position={bush.position} scale={bush.scale} castShadow receiveShadow>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#4ABC65" roughness={0.92} />
        </mesh>
      ))}
    </>
  );
}

// 主场景组件
function Scene() {
  // 树木位置
  const treePositions = [
    [-55, 0, -45], [-55, 0, -5], [-55, 0, 35],
    [55, 0, -45], [55, 0, -5], [55, 0, 35],
    [-28, 0, 50], [0, 0, 56], [28, 0, 50],
    [-28, 0, -55], [0, 0, -60], [28, 0, -55],
    [-62, 0, 15], [62, 0, 15]
  ];

  return (
    <>
      {/* 地面 */}
      <Ground />

      {/* 建筑 */}
      <OfficeBuilding position={[-38, 0, -28]} />
      <ControlCenter position={[38, 0, -28]} />

      {/* 道路 */}
      <Roads />

      {/* 停机坪 */}
      <LandingPad />

      {/* 树木 */}
      {treePositions.map((pos, i) => (
        <Tree key={i} position={pos} />
      ))}

      {/* 灌木 */}
      <Bushes />

      {/* 接触阴影 - 增强落地感 */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={150}
        blur={2}
        far={80}
      />
    </>
  );
}

// React组件导出
export function R3FShowcase() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          outputColorSpace: THREE.SRGBColorSpace
        }}
      >
        {/* 相机 */}
        <PerspectiveCamera
          makeDefault
          position={[-85, 55, 85]}
          fov={42}
        />

        {/* 控制器 */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={30}
          maxDistance={200}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 5, 0]}
        />

        {/* 天空 */}
        <Sky
          sunPosition={[100, 20, 100]}
          turbidity={0.5}
          rayleigh={0.5}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />

        {/* 主方向光 */}
        <directionalLight
          position={[60, 80, 50]}
          intensity={2.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-90}
          shadow-camera-right={90}
          shadow-camera-top={90}
          shadow-camera-bottom={-90}
          shadow-bias={-0.0001}
        />

        {/* 环境光 */}
        <ambientLight intensity={0.4} />

        {/* 半球光 */}
        <hemisphereLight
          skyColor="#72C5F2"
          groundColor="#38A95A"
          intensity={0.6}
        />

        {/* 场景内容 */}
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
