/**
 * 订单渲染器
 * 创建和管理8个订单货箱的3D模型
 */

import * as THREE from 'three';
import { businessToWorld } from './CoordinateSystem.js';

export class OrderRenderer {
  constructor(scene, orders) {
    this.scene = scene;
    this.orders = orders;
    this.orderMeshes = [];
    this.createOrders();
  }

  createOrders() {
    this.orders.forEach((order, index) => {
      const group = new THREE.Group();

      // 货箱主体
      const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
      const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFE66D,
        roughness: 0.4,
        metalness: 0.6,
        emissive: 0xFFE66D,
        emissiveIntensity: 0.3
      });
      const box = new THREE.Mesh(boxGeometry, boxMaterial);
      box.castShadow = true;
      group.add(box);

      // 发光外框
      const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0xFFE66D,
        linewidth: 2
      });
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      group.add(edges);

      // 呼吸光环
      const ringGeometry = new THREE.TorusGeometry(1.5, 0.1, 8, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFE66D,
        transparent: true,
        opacity: 0.6
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -1.5;
      group.add(ring);

      // 点光源
      const pointLight = new THREE.PointLight(0xFFE66D, 1, 10);
      group.add(pointLight);

      // 订单编号标签
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(255, 230, 109, 0.9)';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#0F131C';
      ctx.font = 'bold 60px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(order.id.toString(), 64, 64);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(1.5, 1.5, 1);
      sprite.position.y = 1.5;
      group.add(sprite);

      // 使用新的坐标转换系统
      const worldPos = businessToWorld(order.x, order.y, order.z);

      group.position.set(worldPos.x, worldPos.y, worldPos.z);
      group.userData = { orderId: order.id, ring, pointLight, initialY: worldPos.y };

      this.scene.add(group);
      this.orderMeshes.push(group);
    });
  }

  update(orders) {
    this.orderMeshes.forEach((mesh, index) => {
      const order = orders[index];
      const ring = mesh.userData.ring;
      const pointLight = mesh.userData.pointLight;
      const initialY = mesh.userData.initialY;

      if (order.completed) {
        // 完成动画：缩小消失
        mesh.scale.x = Math.max(0, mesh.scale.x - 0.05);
        mesh.scale.y = Math.max(0, mesh.scale.y - 0.05);
        mesh.scale.z = Math.max(0, mesh.scale.z - 0.05);
        mesh.visible = mesh.scale.x > 0.01;
      } else {
        // 悬浮呼吸动画
        const time = Date.now() * 0.001;
        mesh.position.y = initialY + Math.sin(time * 2 + index) * 0.5;

        // 光环旋转
        ring.rotation.z += 0.02;

        // 呼吸光效
        const pulse = Math.sin(time * 3 + index) * 0.3 + 0.7;
        pointLight.intensity = pulse;
        ring.material.opacity = pulse * 0.6;
      }
    });
  }

  // 触发订单完成特效
  triggerCompletionEffect(orderId) {
    const mesh = this.orderMeshes.find(m => m.userData.orderId === orderId);
    if (!mesh) return;

    // 爆发粒子特效
    const particleCount = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = mesh.position.x;
      positions[i * 3 + 1] = mesh.position.y;
      positions[i * 3 + 2] = mesh.position.z;

      velocities.push({
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 2,
        z: (Math.random() - 0.5) * 2
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xFFE66D,
      size: 0.5,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // 粒子动画
    let life = 1.0;
    const animate = () => {
      if (life <= 0) {
        this.scene.remove(particles);
        return;
      }

      const positions = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += velocities[i].x * 0.5;
        positions[i * 3 + 1] += velocities[i].y * 0.5;
        positions[i * 3 + 2] += velocities[i].z * 0.5;
        velocities[i].y -= 0.05; // 重力
      }
      particles.geometry.attributes.position.needsUpdate = true;

      life -= 0.02;
      material.opacity = life;

      requestAnimationFrame(animate);
    };
    animate();
  }
}
