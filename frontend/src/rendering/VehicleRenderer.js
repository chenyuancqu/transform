/**
 * 车辆渲染器（母车）
 * 创建和更新母车的3D模型
 */

import * as THREE from 'three';
import { businessToWorld } from './CoordinateSystem.js';

export class VehicleRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.createRover();
    this.scene.add(this.group);

    // 充电光环
    this.chargingEffect = null;
    this.createChargingEffect();
  }

  createRover() {
    // 车身主体
    const bodyGeometry = new THREE.BoxGeometry(4, 1.5, 6);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x38BDF8,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x1E90FF,
      emissiveIntensity: 0.1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // 顶部充电平台
    const platformGeometry = new THREE.CylinderGeometry(2.5, 2.5, 0.3, 16);
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x6EE7B7,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x6EE7B7,
      emissiveIntensity: 0.15
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 2.5;
    platform.castShadow = true;
    this.group.add(platform);

    // 平台边缘发光圈
    const ringGeometry = new THREE.TorusGeometry(2.5, 0.1, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x6EE7B7,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 2.5;
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // 4个车轮
    const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1E2636,
      roughness: 0.8,
      metalness: 0.2
    });

    const wheelPositions = [
      { x: -2, z: 2.5 },
      { x: 2, z: 2.5 },
      { x: -2, z: -2.5 },
      { x: 2, z: -2.5 }
    ];

    this.wheels = [];
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, 0.8, pos.z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      this.group.add(wheel);
      this.wheels.push(wheel);
    });

    // 标识灯
    const lightGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0x3B6DFF,
      transparent: true,
      opacity: 0.9
    });
    const light = new THREE.Mesh(lightGeometry, lightMaterial);
    light.position.set(0, 2.8, 2.5);

    // 点光源
    const pointLight = new THREE.PointLight(0x3B6DFF, 1, 10);
    pointLight.position.copy(light.position);
    this.group.add(light);
    this.group.add(pointLight);
  }

  createChargingEffect() {
    // 充电时的螺旋光环特效
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x6EE7B7,
      size: 0.3,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });

    this.chargingEffect = new THREE.Points(geometry, material);
    this.chargingEffect.visible = false;
    this.group.add(this.chargingEffect);
  }

  update(normalizedX, normalizedY, isCharging = false) {
    // 使用新的坐标转换系统
    const worldPos = businessToWorld(normalizedX, normalizedY, 0);

    // 计算移动方向
    const deltaX = worldPos.x - this.group.position.x;
    const deltaZ = worldPos.z - this.group.position.z;

    // 平滑移动
    this.group.position.x += deltaX * 0.05;
    this.group.position.z += deltaZ * 0.05;
    this.group.position.y = 0.5;  // 稍微抬高避免与地面重叠

    // 车轮旋转动画
    const speed = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    this.wheels.forEach(wheel => {
      wheel.rotation.x += speed * 0.1;
    });

    // 车身朝向
    if (Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01) {
      const targetRotation = Math.atan2(deltaX, deltaZ);
      this.group.rotation.y += (targetRotation - this.group.rotation.y) * 0.1;
    }

    // 充电特效
    this.updateChargingEffect(isCharging);
  }

  updateChargingEffect(isCharging) {
    if (isCharging) {
      this.chargingEffect.visible = true;
      this.chargingEffect.material.opacity = Math.min(1, this.chargingEffect.material.opacity + 0.05);

      // 螺旋上升粒子动画
      const positions = this.chargingEffect.geometry.attributes.position.array;
      const time = Date.now() * 0.001;

      for (let i = 0; i < positions.length / 3; i++) {
        const angle = (i / (positions.length / 3)) * Math.PI * 2 + time * 2;
        const radius = 3;
        const height = ((time * 2 + i * 0.1) % 5);

        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
      }

      this.chargingEffect.geometry.attributes.position.needsUpdate = true;
    } else {
      this.chargingEffect.material.opacity = Math.max(0, this.chargingEffect.material.opacity - 0.05);
      if (this.chargingEffect.material.opacity === 0) {
        this.chargingEffect.visible = false;
      }
    }
  }

  getWorldPosition() {
    const pos = new THREE.Vector3();
    this.group.getWorldPosition(pos);
    return pos;
  }
}
