/**
 * 创建高质量样板建筑GLB模型
 * 使用程序化方法创建但导出为可复用的GLB资产
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// 创建现代办公楼模型
function createModernOfficeBuilding() {
  const building = new THREE.Group();
  building.name = 'ModernOfficeBuilding';

  // 主体 - 多层设计
  const floors = 8;
  const floorHeight = 4;
  const baseWidth = 20;
  const baseDepth = 15;

  for (let i = 0; i < floors; i++) {
    const width = baseWidth - (i > 4 ? 2 : 0);
    const depth = baseDepth - (i > 4 ? 1.5 : 0);

    const floorGeometry = new THREE.BoxGeometry(width, floorHeight, depth);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x5BA3D0,
      roughness: 0.7,
      metalness: 0.2
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = i * floorHeight + floorHeight / 2;
    floor.castShadow = true;
    floor.receiveShadow = true;
    building.add(floor);

    // 楼层分隔线
    if (i < floors - 1) {
      const separator = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.3, 0.2, depth + 0.3),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 })
      );
      separator.position.y = (i + 1) * floorHeight;
      building.add(separator);
    }
  }

  // 屋顶
  const roofGeometry = new THREE.BoxGeometry(baseWidth + 2, 2, baseDepth + 2);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x3A5F7D,
    roughness: 0.8
  });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = floors * floorHeight + 1;
  roof.castShadow = true;
  building.add(roof);

  // 入口
  const entranceGeometry = new THREE.BoxGeometry(5, 4, 1.5);
  const entranceMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.8
  });
  const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
  entrance.position.set(0, 2, baseDepth / 2 + 0.75);
  building.add(entrance);

  // 门
  const doorGeometry = new THREE.BoxGeometry(2.5, 3.5, 0.2);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2C2416,
    roughness: 0.6,
    metalness: 0.3
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 1.75, baseDepth / 2 + 1.6);
  building.add(door);

  // 窗户 (简化版，使用实例化)
  const windowGeometry = new THREE.PlaneGeometry(1.5, 2);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A9FD8,
    emissive: 0x2563AA,
    emissiveIntensity: 0.2,
    roughness: 0.2,
    metalness: 0.4
  });

  // 为每层添加窗户
  for (let floor = 0; floor < floors; floor++) {
    const y = floor * floorHeight + floorHeight / 2;
    const currentWidth = baseWidth - (floor > 4 ? 2 : 0);
    const currentDepth = baseDepth - (floor > 4 ? 1.5 : 0);

    // 前后窗户
    for (let x = -currentWidth/2 + 3; x < currentWidth/2 - 2; x += 3) {
      // 前面
      const windowFront = new THREE.Mesh(windowGeometry, windowMaterial);
      windowFront.position.set(x, y, currentDepth/2 + 0.01);
      building.add(windowFront);

      // 后面
      const windowBack = new THREE.Mesh(windowGeometry, windowMaterial);
      windowBack.position.set(x, y, -currentDepth/2 - 0.01);
      windowBack.rotation.y = Math.PI;
      building.add(windowBack);
    }

    // 侧面窗户
    for (let z = -currentDepth/2 + 3; z < currentDepth/2 - 2; z += 3) {
      // 左侧
      const windowLeft = new THREE.Mesh(windowGeometry, windowMaterial);
      windowLeft.position.set(-currentWidth/2 - 0.01, y, z);
      windowLeft.rotation.y = Math.PI / 2;
      building.add(windowLeft);

      // 右侧
      const windowRight = new THREE.Mesh(windowGeometry, windowMaterial);
      windowRight.position.set(currentWidth/2 + 0.01, y, z);
      windowRight.rotation.y = -Math.PI / 2;
      building.add(windowRight);
    }
  }

  return building;
}

// 创建控制中心
function createControlCenter() {
  const building = new THREE.Group();
  building.name = 'ControlCenter';

  // 主体 - 低层宽敞设计
  const mainGeometry = new THREE.BoxGeometry(18, 12, 18);
  const mainMaterial = new THREE.MeshStandardMaterial({
    color: 0x6BC9B8,
    roughness: 0.7,
    metalness: 0.1
  });
  const main = new THREE.Mesh(mainGeometry, mainMaterial);
  main.position.y = 6;
  main.castShadow = true;
  main.receiveShadow = true;
  building.add(main);

  // 顶部观测平台
  const topGeometry = new THREE.CylinderGeometry(6, 7, 4, 16);
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A9B8E,
    roughness: 0.6,
    metalness = 0.3
  });
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.position.y = 14;
  top.castShadow = true;
  building.add(top);

  // 屋顶
  const roofGeometry = new THREE.CylinderGeometry(5, 6, 2, 16);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x2A7D72,
    roughness: 0.8
  });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = 17;
  roof.castShadow = true;
  building.add(roof);

  // 入口
  const entranceGeometry = new THREE.BoxGeometry(4, 3.5, 1);
  const entranceMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.8
  });
  const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
  entrance.position.set(0, 1.75, 9.5);
  building.add(entrance);

  // 门
  const doorGeometry = new THREE.BoxGeometry(2, 3, 0.2);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2C2416,
    roughness: 0.6,
    metalness: 0.3
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 1.5, 10);
  building.add(door);

  // 窗户
  const windowGeometry = new THREE.PlaneGeometry(1.5, 2);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A9FD8,
    emissive: 0x2563AA,
    emissiveIntensity: 0.2,
    roughness: 0.2,
    metalness: 0.4
  });

  // 主层窗户
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI / 2);
    const x = Math.cos(angle) * 9.5;
    const z = Math.sin(angle) * 9.5;

    const window = new THREE.Mesh(windowGeometry, windowMaterial);
    window.position.set(x, 6, z);
    window.rotation.y = -angle;
    building.add(window);
  }

  // 顶层观测窗
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI / 4);
    const x = Math.cos(angle) * 6.5;
    const z = Math.sin(angle) * 6.5;

    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1.5),
      windowMaterial
    );
    window.position.set(x, 14, z);
    window.rotation.y = -angle;
    building.add(window);
  }

  return building;
}

// 导出为GLB
export async function exportToGLB(object, filename) {
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        const blob = new Blob([gltf], { type: 'application/octet-stream' });
        resolve(blob);
      },
      (error) => {
        reject(error);
      },
      { binary: true }
    );
  });
}

// 创建并导出模型
export async function generateBuildingAssets() {
  const assets = {
    office: createModernOfficeBuilding(),
    control: createControlCenter()
  };

  const results = {};

  for (const [name, model] of Object.entries(assets)) {
    try {
      const blob = await exportToGLB(model, `${name}-building.glb`);
      results[name] = blob;
      console.log(`✅ Generated ${name} building GLB`);
    } catch (error) {
      console.error(`❌ Failed to generate ${name}:`, error);
    }
  }

  return results;
}
