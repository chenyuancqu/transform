/**
 * 样板场景 - 简化测试版本
 * 先用高质量程序化建筑，确保可见
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PremiumShowcase {
  constructor(container) {
    this.container = container;
    this.loader = new GLTFLoader();

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0xE0F4FF, 100, 250);

    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 500);
    this.camera.position.set(-70, 50, 70);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLighting();

    // Ground
    this.createGround();

    // Build scene immediately with procedural buildings
    this.buildScene();

    // Try to load GLB models in background
    this.tryLoadGLBModels();

    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Sun
    const sun = new THREE.DirectionalLight(0xFFFAF0, 1.6);
    sun.position.set(50, 70, 40);
    sun.castShadow = true;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 150;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00005;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.7);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x5DBD6F, 0.9);
    this.scene.add(hemi);

    const fill = new THREE.DirectionalLight(0xC8D8F0, 0.35);
    fill.position.set(-30, 25, -30);
    this.scene.add(fill);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(180, 180);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5DBD6F';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 3500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = Math.random();
      ctx.fillStyle = shade < 0.25 ? '#4A9B5C' : shade < 0.6 ? '#7FD990' : '#6BC97C';
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 12);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  async tryLoadGLBModels() {
    console.log('🔄 Attempting to load GLB models...');

    try {
      const building1 = await this.loadModel('/models/buildings/simple-building.glb');
      console.log('✅ GLB model loaded, but using procedural for now');
      // 可以在这里替换程序化建筑
    } catch (error) {
      console.log('ℹ️ GLB loading skipped, using procedural buildings');
    }
  }

  loadModel(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (error) => reject(error)
      );
    });
  }

  buildScene() {
    console.log('🏗️ Building scene with procedural buildings...');

    // Create high-quality procedural buildings
    this.createOfficeBuilding();
    this.createControlCenter();

    // Infrastructure
    this.createRoads();
    this.createLandingPad();
    this.createLandscape();
  }

  createOfficeBuilding() {
    const building = new THREE.Group();

    // Multi-floor design
    const floors = 8;
    const baseWidth = 18;
    const baseDepth = 14;

    for (let i = 0; i < floors; i++) {
      const floorHeight = 3.5;
      const width = baseWidth - (i > 5 ? 1.5 : 0);
      const depth = baseDepth - (i > 5 ? 1 : 0);

      const floorGeometry = new THREE.BoxGeometry(width, floorHeight, depth);
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x5BA3D0 : 0x6BB5E0,
        roughness: 0.7,
        metalness: 0.2
      });

      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.y = i * floorHeight + floorHeight / 2;
      floor.castShadow = true;
      floor.receiveShadow = true;
      building.add(floor);

      // Floor separator
      if (i < floors - 1) {
        const separator = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.3, 0.15, depth + 0.3),
          new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 })
        );
        separator.position.y = (i + 1) * floorHeight;
        building.add(separator);
      }
    }

    // Roof
    const roofGeometry = new THREE.BoxGeometry(baseWidth + 1.5, 1.8, baseDepth + 1.5);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x3A5F7D,
      roughness: 0.8
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = floors * 3.5 + 0.9;
    roof.castShadow = true;
    building.add(roof);

    // Windows (simplified)
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A9FD8,
      emissive: 0x2563AA,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.4
    });

    for (let floor = 0; floor < floors; floor++) {
      const y = floor * 3.5 + 1.75;
      const currentWidth = baseWidth - (floor > 5 ? 1.5 : 0);

      // Front windows
      for (let x = -currentWidth/2 + 2; x < currentWidth/2 - 1.5; x += 2.5) {
        const window = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 1.8),
          windowMaterial
        );
        window.position.set(x, y, baseDepth/2 + 0.01);
        building.add(window);
      }
    }

    building.position.set(-35, 0, -25);
    this.scene.add(building);
    console.log('✅ Office building created at', building.position);
  }

  createControlCenter() {
    const building = new THREE.Group();

    // Base
    const baseGeometry = new THREE.BoxGeometry(16, 14, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BC9B8,
      roughness: 0.7,
      metalness: 0.15
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 7;
    base.castShadow = true;
    base.receiveShadow = true;
    building.add(base);

    // Top tower
    const towerGeometry = new THREE.CylinderGeometry(5.5, 6, 4, 16);
    const towerMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A9B8E,
      roughness: 0.65,
      metalness: 0.25
    });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.y = 16;
    tower.castShadow = true;
    building.add(tower);

    // Roof
    const roofGeometry = new THREE.CylinderGeometry(4.5, 5.5, 1.5, 16);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x2A7D72,
      roughness: 0.8
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 18.5;
    roof.castShadow = true;
    building.add(roof);

    // Windows
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A9FD8,
      emissive: 0x2563AA,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.4
    });

    // Base windows (4 sides)
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2);
      const x = Math.cos(angle) * 8.2;
      const z = Math.sin(angle) * 8.2;

      const window = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2),
        windowMaterial
      );
      window.position.set(x, 7, z);
      window.rotation.y = -angle;
      building.add(window);
    }

    building.position.set(35, 0, -25);
    this.scene.add(building);
    console.log('✅ Control center created at', building.position);
  }

  createRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B95A0,
      roughness: 0.85,
      metalness: 0.1
    });

    const mainRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 12),
      roadMaterial
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.y = 0.02;
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 120),
      roadMaterial
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.y = 0.02;
    crossRoad.receiveShadow = true;
    this.scene.add(crossRoad);

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xDDD5C7,
      roughness: 0.92
    });

    [-7, 7].forEach(offset => {
      const sw1 = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 2.5),
        sidewalkMaterial
      );
      sw1.rotation.x = -Math.PI / 2;
      sw1.position.set(0, 0.03, offset);
      sw1.receiveShadow = true;
      this.scene.add(sw1);

      const sw2 = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 120),
        sidewalkMaterial
      );
      sw2.rotation.x = -Math.PI / 2;
      sw2.position.set(offset, 0.03, 0);
      sw2.receiveShadow = true;
      this.scene.add(sw2);
    });

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const line1 = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 0.25),
      lineMaterial
    );
    line1.rotation.x = -Math.PI / 2;
    line1.position.y = 0.04;
    this.scene.add(line1);

    const line2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 120),
      lineMaterial
    );
    line2.rotation.x = -Math.PI / 2;
    line2.position.y = 0.04;
    this.scene.add(line2);
  }

  createLandingPad() {
    const padGeometry = new THREE.CircleGeometry(10, 32);
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BA8D8,
      roughness: 0.6,
      emissive: 0x4A8AC8,
      emissiveIntensity: 0.12,
      metalness: 0.25
    });

    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.05, 20);
    pad.receiveShadow = true;
    this.scene.add(pad);

    const ringGeometry = new THREE.RingGeometry(9, 9.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 20);
    this.scene.add(ring);

    const hMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), hMaterial);
    h1.rotation.x = -Math.PI / 2;
    h1.position.set(0, 0.07, 20);
    this.scene.add(h1);

    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), hMaterial);
    h2.rotation.x = -Math.PI / 2;
    h2.position.set(-1.7, 0.07, 20);
    this.scene.add(h2);

    const h3 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), hMaterial);
    h3.rotation.x = -Math.PI / 2;
    h3.position.set(1.7, 0.07, 20);
    this.scene.add(h3);
  }

  createLandscape() {
    const treePositions = [
      [-50, 0, -40], [-50, 0, 0], [-50, 0, 40],
      [50, 0, -40], [50, 0, 0], [50, 0, 40],
      [-25, 0, 45], [0, 0, 50], [25, 0, 45],
      [-25, 0, -50], [0, 0, -55], [25, 0, -50]
    ];

    treePositions.forEach(pos => {
      const tree = this.createTree();
      tree.position.set(...pos);
      const scale = 0.8 + Math.random() * 0.4;
      tree.scale.set(scale, scale, scale);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
    });

    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BC97C,
      roughness: 0.9
    });

    for (let i = 0; i < 16; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(1 + Math.random() * 0.4, 8, 8),
        bushMaterial
      );
      const angle = (i / 16) * Math.PI * 2;
      const radius = 30 + Math.random() * 8;
      bush.position.set(
        Math.cos(angle) * radius,
        0.7,
        Math.sin(angle) * radius
      );
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.scene.add(bush);
    }
  }

  createTree() {
    const tree = new THREE.Group();

    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.65, 4.5, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x6B4423,
      roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2.25;
    trunk.castShadow = true;
    tree.add(trunk);

    const colors = [0x4A9B5C, 0x5AAD6C, 0x6BC97C];
    for (let i = 0; i < 3; i++) {
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: 0.88
      });

      const radius = 3.2 - i * 0.6;
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 8),
        foliageMaterial
      );
      crown.position.y = 5.5 + i * 1.3;
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
