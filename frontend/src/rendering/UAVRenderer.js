/**
 * 无人机渲染器
 * 创建和更新3架无人机的3D模型
 */

import * as THREE from 'three';
import { businessToWorld } from './CoordinateSystem.js';

export class UAVRenderer {
  constructor(scene, uavId) {
    this.scene = scene;
    this.uavId = uavId;
    this.group = new THREE.Group();

    // 3 UAVs with bright vibrant colors
    this.colors = [
      { main: 0xFF6B6B, light: 0xFF9999 }, // Bright red
      { main: 0x4ECDC4, light: 0x7EDDD6 }, // Bright cyan
      { main: 0xFFE66D, light: 0xFFF099 }  // Bright yellow
    ];

    this.color = this.colors[uavId - 1];
    this.createUAV();
    this.createTrail();
    this.createBatteryUI();

    this.scene.add(this.group);

    // 轨迹点记录
    this.trailPoints = [];
    this.maxTrailPoints = 100;
  }

  createUAV() {
    // 机身
    const bodyGeometry = new THREE.BoxGeometry(1.5, 0.6, 1.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: this.color.main,
      roughness: 0.4,
      metalness: 0.6,
      emissive: this.color.main,
      emissiveIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    this.group.add(body);

    // 4个旋翼臂
    this.rotors = [];
    const armPositions = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 }
    ];

    armPositions.forEach((pos, index) => {
      // 臂
      const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8);
      const armMaterial = new THREE.MeshStandardMaterial({
        color: 0x1E2636,
        roughness: 0.6,
        metalness: 0.4
      });
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.position.set(pos.x * 0.5, 0, pos.z * 0.5);
      arm.rotation.z = Math.atan2(pos.z, pos.x);
      arm.rotation.x = Math.PI / 2;
      this.group.add(arm);

      // 旋翼
      const rotorGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16);
      const rotorMaterial = new THREE.MeshStandardMaterial({
        color: this.color.light,
        roughness: 0.3,
        metalness: 0.7,
        transparent: true,
        opacity: 0.6
      });
      const rotor = new THREE.Mesh(rotorGeometry, rotorMaterial);
      rotor.position.set(pos.x, 0.4, pos.z);
      this.group.add(rotor);
      this.rotors.push(rotor);
    });

    // 底部货舱
    const cargoGeometry = new THREE.BoxGeometry(1, 0.4, 1);
    const cargoMaterial = new THREE.MeshStandardMaterial({
      color: 0x161D2B,
      roughness: 0.7,
      metalness: 0.3
    });
    const cargo = new THREE.Mesh(cargoGeometry, cargoMaterial);
    cargo.position.y = -0.7;
    this.group.add(cargo);

    // 编号标识灯
    const labelGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const labelMaterial = new THREE.MeshBasicMaterial({
      color: this.color.main,
      transparent: true,
      opacity: 1
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 0.5;
    this.group.add(label);

    // 点光源
    this.pointLight = new THREE.PointLight(this.color.main, 1, 8);
    this.pointLight.position.y = 0.5;
    this.group.add(this.pointLight);
  }

  createTrail() {
    // 飞行轨迹线
    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxTrailPoints * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const trailMaterial = new THREE.LineBasicMaterial({
      color: this.color.main,
      transparent: true,
      opacity: 0.5,
      linewidth: 2
    });

    this.trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(this.trail);
  }

  createBatteryUI() {
    // 电量UI（Billboard精灵）
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    this.batteryCanvas = canvas;
    this.batteryCtx = ctx;

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });

    this.batterySprite = new THREE.Sprite(spriteMaterial);
    this.batterySprite.scale.set(4, 1, 1);
    this.batterySprite.position.y = 3;
    this.group.add(this.batterySprite);
  }

  updateBatteryUI(battery) {
    const ctx = this.batteryCtx;
    const canvas = this.batteryCanvas;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = 'rgba(15, 19, 28, 0.9)';
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 8);
    ctx.fill();

    // 电量条背景
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.roundRect(20, 20, canvas.width - 40, canvas.height - 40, 6);
    ctx.fill();

    // 电量条
    const batteryWidth = (canvas.width - 40) * Math.max(0, Math.min(1, battery));
    if (battery > 0.3) {
      const gradient = ctx.createLinearGradient(20, 0, 20 + batteryWidth, 0);
      gradient.addColorStop(0, '#6EE7B7');
      gradient.addColorStop(1, '#38BDF8');
      ctx.fillStyle = gradient;
    } else {
      const gradient = ctx.createLinearGradient(20, 0, 20 + batteryWidth, 0);
      gradient.addColorStop(0, '#EF4444');
      gradient.addColorStop(1, '#F59E0B');
      ctx.fillStyle = gradient;
    }
    ctx.roundRect(20, 20, batteryWidth, canvas.height - 40, 6);
    ctx.fill();

    // 文字
    ctx.fillStyle = battery > 0.3 ? '#38BDF8' : '#EF4444';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`UAV-${this.uavId} ${Math.round(battery * 100)}%`, canvas.width / 2, 40);

    // 更新纹理
    this.batterySprite.material.map.needsUpdate = true;
  }

  update(normalizedX, normalizedY, normalizedZ, battery) {
    // 使用新的坐标转换系统
    const worldPos = businessToWorld(normalizedX, normalizedY, normalizedZ);

    // 平滑移动
    this.group.position.x += (worldPos.x - this.group.position.x) * 0.08;
    this.group.position.y += (worldPos.y - this.group.position.y) * 0.08;
    this.group.position.z += (worldPos.z - this.group.position.z) * 0.08;

    // 旋翼旋转动画
    this.rotors.forEach(rotor => {
      rotor.rotation.y += 0.5;
    });

    // 更新飞行轨迹
    this.updateTrail();

    // 更新电量UI
    this.updateBatteryUI(battery);

    // 电量低闪烁警告
    if (battery < 0.2) {
      const pulse = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
      this.pointLight.intensity = pulse * 2;
    } else {
      this.pointLight.intensity = 1;
    }
  }

  updateTrail() {
    // 记录轨迹点
    const currentPos = this.group.position.clone();
    this.trailPoints.push(currentPos);

    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.shift();
    }

    // 更新轨迹线
    const positions = this.trail.geometry.attributes.position.array;
    for (let i = 0; i < this.maxTrailPoints; i++) {
      if (i < this.trailPoints.length) {
        const point = this.trailPoints[i];
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
      } else {
        // 填充空白点
        positions[i * 3] = currentPos.x;
        positions[i * 3 + 1] = currentPos.y;
        positions[i * 3 + 2] = currentPos.z;
      }
    }

    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  getWorldPosition() {
    const pos = new THREE.Vector3();
    this.group.getWorldPosition(pos);
    return pos;
  }
}
