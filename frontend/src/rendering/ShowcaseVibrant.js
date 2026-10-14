/**
 * 高品质样板场景 - 色彩修复版
 * 解决灰蒙蒙问题，实现鲜艳动画游戏风格
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 精确的游戏级配色方案
const COLORS = {
  // 环境
  sky: 0x72C5F2,          // 清澈蓝天
  grass: 0x59C86A,        // 鲜活草地
  grassDark: 0x38A95A,    // 深色草地

  // 植被
  treeCrown: 0x2FAE5B,    // 树冠主色
  treeCrownLight: 0x85DA72, // 树冠高光
  treeTrunk: 0x6B4423,    // 树干
  bush: 0x4ABC65,         // 灌木

  // 建筑
  buildingBlue: 0x318EC9,   // 蓝色建筑
  buildingCyan: 0x38B9AE,   // 青色建筑
  buildingCream: 0xF4E5C7,  // 奶油白
  buildingOrange: 0xF5A352, // 橙色点缀
  roofDark: 0x295B86,       // 深蓝屋顶

  // 道路
  road: 0x8798A6,         // 道路灰
  sidewalk: 0xE8DCC8,     // 人行道米色
  roadLine: 0xFFFFFF,     // 白色标线

  // 停机坪
  padBlue: 0x4A9FD8,      // 停机坪蓝

  // 窗户
  window: 0x6EC4F5,       // 明亮窗户
  windowEmissive: 0x4A9FD8 // 窗户发光
};

export class PremiumShowcase {
  constructor(container) {
    this.container = container;
    this.loader = new GLTFLoader();

    this.init();
  }

  init() {
    // Scene - 无雾效，保持清晰
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    // 移除雾效以保持清晰度
    // this.scene.fog = null;

    // Camera - 调整视角确保建筑完整可见
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 500);
    this.camera.position.set(-85, 55, 85);
    this.camera.lookAt(0, 5, 0);

    // Renderer - 关键色彩管理配置
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 阴影配置
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 色彩管理 - 这是关键！
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15; // 稍微提升曝光
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    // Lighting - 重新设计光照系统
    this.setupLighting();

    // Ground - 鲜艳草地
    this.createGround();

    // Build scene
    this.buildScene();

    window.addEventListener('resize', () => this.onResize());

    console.log('🎨 场景初始化 - 色彩优化版');
  }

  setupLighting() {
    // 主太阳光 - 温暖明亮的午后阳光
    const sun = new THREE.DirectionalLight(0xFFFBF0, 2.2); // 增强强度
    sun.position.set(60, 80, 50);
    sun.castShadow = true;

    // 阴影优化
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 200;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 1.5; // 柔和阴影边缘
    this.scene.add(sun);

    // 环境光 - 适度降低避免洗掉明暗
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.5); // 从0.7降到0.5
    this.scene.add(ambient);

    // 半球光 - 天地色彩渐变
    const hemi = new THREE.HemisphereLight(
      COLORS.sky,        // 天空色
      COLORS.grassDark,  // 地面色
      0.7                // 降低强度
    );
    this.scene.add(hemi);

    // 填充光 - 偏冷色调，模拟天空反射
    const fill = new THREE.DirectionalLight(0xB8D8F5, 0.3); // 降低强度
    fill.position.set(-40, 30, -40);
    this.scene.add(fill);

    console.log('✅ 光照系统优化完成');
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200, 40, 40);

    // 创建高饱和度草地纹理
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 基础草地色 - 鲜艳绿色
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

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.0,
      // 关键：不要过度调整color，让纹理本身的颜色显示
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    console.log('✅ 鲜艳草地创建完成');
  }

  buildScene() {
    console.log('🏗️ 构建场景...');

    // 创建建筑
    this.createOfficeBuilding();
    this.createControlCenter();

    // 基础设施
    this.createRoads();
    this.createLandingPad();
    this.createLandscape();
  }

  createOfficeBuilding() {
    const building = new THREE.Group();

    const floors = 7;
    const baseWidth = 20;
    const baseDepth = 15;
    const floorHeight = 4;

    for (let i = 0; i < floors; i++) {
      const width = baseWidth - (i > 4 ? 2 : 0);
      const depth = baseDepth - (i > 4 ? 1.5 : 0);

      // 使用明确的蓝色
      const floorGeometry = new THREE.BoxGeometry(width, floorHeight, depth);
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.buildingBlue,
        roughness: 0.65,
        metalness: 0.25,
        // 关键：不添加emissive，保持自然明暗
      });

      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.y = i * floorHeight + floorHeight / 2;
      floor.castShadow = true;
      floor.receiveShadow = true;
      building.add(floor);

      // 白色楼层分隔线
      if (i < floors - 1) {
        const separator = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.4, 0.2, depth + 0.4),
          new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            roughness: 0.8
          })
        );
        separator.position.y = (i + 1) * floorHeight;
        building.add(separator);
      }
    }

    // 深色屋顶 - 形成明显对比
    const roofGeometry = new THREE.BoxGeometry(baseWidth + 1.5, 2.2, baseDepth + 1.5);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.roofDark,
      roughness: 0.75,
      metalness: 0.15
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = floors * floorHeight + 1.1;
    roof.castShadow = true;
    building.add(roof);

    // 明亮窗户
    const windowGeometry = new THREE.PlaneGeometry(1.4, 2);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.window,
      emissive: COLORS.windowEmissive,
      emissiveIntensity: 0.15, // 适度发光
      roughness: 0.2,
      metalness: 0.5
    });

    // 前面窗户
    for (let floor = 0; floor < floors; floor++) {
      const y = floor * floorHeight + floorHeight / 2;
      const currentWidth = baseWidth - (floor > 4 ? 2 : 0);
      const currentDepth = baseDepth - (floor > 4 ? 1.5 : 0);

      for (let x = -currentWidth/2 + 2.5; x < currentWidth/2 - 2; x += 3) {
        const window = new THREE.Mesh(windowGeometry, windowMaterial);
        window.position.set(x, y, currentDepth/2 + 0.02);
        building.add(window);
      }
    }

    building.position.set(-38, 0, -28);
    this.scene.add(building);
    console.log('✅ 蓝色办公楼完成');
  }

  createControlCenter() {
    const building = new THREE.Group();

    // 青色基座
    const baseGeometry = new THREE.BoxGeometry(18, 15, 18);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.buildingCyan,
      roughness: 0.65,
      metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 7.5;
    base.castShadow = true;
    base.receiveShadow = true;
    building.add(base);

    // 塔楼
    const towerGeometry = new THREE.CylinderGeometry(6, 6.5, 5, 16);
    const towerMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLORS.buildingCyan).multiplyScalar(0.85),
      roughness: 0.6,
      metalness: 0.3
    });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.y = 17.5;
    tower.castShadow = true;
    building.add(tower);

    // 深色屋顶
    const roofGeometry = new THREE.CylinderGeometry(5, 6, 2, 16);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.roofDark,
      roughness: 0.75
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 20.5;
    roof.castShadow = true;
    building.add(roof);

    // 窗户
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.window,
      emissive: COLORS.windowEmissive,
      emissiveIntensity: 0.15,
      roughness: 0.2,
      metalness: 0.5
    });

    // 基座窗户
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2);
      const x = Math.cos(angle) * 9.2;
      const z = Math.sin(angle) * 9.2;

      const window = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 2.2),
        windowMaterial
      );
      window.position.set(x, 7.5, z);
      window.rotation.y = -angle;
      building.add(window);
    }

    building.position.set(38, 0, -28);
    this.scene.add(building);
    console.log('✅ 青色控制中心完成');
  }

  createRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.road,
      roughness: 0.88,
      metalness: 0.08
    });

    const mainRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 14),
      roadMaterial
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.y = 0.02;
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 130),
      roadMaterial
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.y = 0.02;
    crossRoad.receiveShadow = true;
    this.scene.add(crossRoad);

    // 米色人行道
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.sidewalk,
      roughness: 0.92
    });

    [-8, 8].forEach(offset => {
      const sw1 = new THREE.Mesh(
        new THREE.PlaneGeometry(130, 3),
        sidewalkMaterial
      );
      sw1.rotation.x = -Math.PI / 2;
      sw1.position.set(0, 0.03, offset);
      sw1.receiveShadow = true;
      this.scene.add(sw1);

      const sw2 = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 130),
        sidewalkMaterial
      );
      sw2.rotation.x = -Math.PI / 2;
      sw2.position.set(offset, 0.03, 0);
      sw2.receiveShadow = true;
      this.scene.add(sw2);
    });

    // 白色标线
    const lineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.roadLine });

    const line1 = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 0.3),
      lineMaterial
    );
    line1.rotation.x = -Math.PI / 2;
    line1.position.y = 0.04;
    this.scene.add(line1);

    const line2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 130),
      lineMaterial
    );
    line2.rotation.x = -Math.PI / 2;
    line2.position.y = 0.04;
    this.scene.add(line2);
  }

  createLandingPad() {
    const padGeometry = new THREE.CircleGeometry(11, 32);
    const padMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.padBlue,
      roughness: 0.55,
      emissive: COLORS.padBlue,
      emissiveIntensity: 0.1,
      metalness: 0.3
    });

    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.05, 22);
    pad.receiveShadow = true;
    this.scene.add(pad);

    const ringGeometry = new THREE.RingGeometry(10, 10.6, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 22);
    this.scene.add(ring);

    // H标记
    const hMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.7), hMaterial);
    h1.rotation.x = -Math.PI / 2;
    h1.position.set(0, 0.07, 22);
    this.scene.add(h1);

    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.5), hMaterial);
    h2.rotation.x = -Math.PI / 2;
    h2.position.set(-1.9, 0.07, 22);
    this.scene.add(h2);

    const h3 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.5), hMaterial);
    h3.rotation.x = -Math.PI / 2;
    h3.position.set(1.9, 0.07, 22);
    this.scene.add(h3);
  }

  createLandscape() {
    // 树木位置
    const treePositions = [
      [-55, 0, -45], [-55, 0, -5], [-55, 0, 35],
      [55, 0, -45], [55, 0, -5], [55, 0, 35],
      [-28, 0, 50], [0, 0, 56], [28, 0, 50],
      [-28, 0, -55], [0, 0, -60], [28, 0, -55],
      [-62, 0, 15], [62, 0, 15]
    ];

    treePositions.forEach(pos => {
      const tree = this.createTree();
      tree.position.set(...pos);
      const scale = 0.85 + Math.random() * 0.35;
      tree.scale.set(scale, scale, scale);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
    });

    // 灌木
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.bush,
      roughness: 0.92
    });

    for (let i = 0; i < 18; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(1.1 + Math.random() * 0.5, 8, 8),
        bushMaterial
      );
      const angle = (i / 18) * Math.PI * 2;
      const radius = 32 + Math.random() * 10;
      bush.position.set(
        Math.cos(angle) * radius,
        0.7,
        Math.sin(angle) * radius
      );
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.scene.add(bush);
    }

    console.log('✅ 景观完成');
  }

  createTree() {
    const tree = new THREE.Group();

    // 树干
    const trunkGeometry = new THREE.CylinderGeometry(0.55, 0.7, 5, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.treeTrunk,
      roughness: 0.96
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    tree.add(trunk);

    // 树冠 - 3层，颜色渐变
    const crownColors = [
      COLORS.treeCrown,
      new THREE.Color(COLORS.treeCrown).lerp(new THREE.Color(COLORS.treeCrownLight), 0.3),
      COLORS.treeCrownLight
    ];

    for (let i = 0; i < 3; i++) {
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: crownColors[i],
        roughness: 0.9
      });

      const radius = 3.5 - i * 0.7;
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 10),
        foliageMaterial
      );
      crown.position.y = 6 + i * 1.4;
      crown.castShadow = true;
      crown.receiveShadow = true;
      tree.add(crown);
    }

    return tree;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.render();
  }
}
