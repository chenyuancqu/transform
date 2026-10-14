/**
 * 样板展示场景 - 使用真实GLB模型
 * Premium Showcase Scene with Real 3D Assets
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PremiumShowcase {
  constructor(container) {
    this.container = container;
    this.loader = new GLTFLoader();
    this.loadedModels = [];

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0xE0F4FF, 100, 250);

    // Camera - 精致俯视角
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

    // Load and build scene
    this.loadAssets().then(() => {
      this.buildScene();
      console.log('✅ Showcase scene ready');
    });

    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Warm sun
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

    // Ambient
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.7);
    this.scene.add(ambient);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x5DBD6F, 0.9);
    this.scene.add(hemi);

    // Fill
    const fill = new THREE.DirectionalLight(0xC8D8F0, 0.35);
    fill.position.set(-30, 25, -30);
    this.scene.add(fill);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(180, 180);

    // Grass texture
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

  async loadAssets() {
    console.log('📦 Loading GLB models...');

    try {
      // Load building 1
      const building1 = await this.loadModel('/models/buildings/simple-building.glb');
      this.loadedModels.push({ model: building1, name: 'building1' });

      // Load building 2
      const building2 = await this.loadModel('/models/buildings/building-02.glb');
      this.loadedModels.push({ model: building2, name: 'building2' });

      console.log(`✅ Loaded ${this.loadedModels.length} models`);
    } catch (error) {
      console.error('❌ Model loading error:', error);
    }
  }

  loadModel(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          console.log(`✅ Loaded: ${url}`);
          resolve(gltf.scene);
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${url}: ${percent.toFixed(0)}%`);
          }
        },
        (error) => {
          console.error(`❌ Failed to load ${url}:`, error);
          reject(error);
        }
      );
    });
  }

  buildScene() {
    // Place buildings
    if (this.loadedModels.length >= 2) {
      // Building 1 - 办公楼
      const building1 = this.loadedModels[0].model.clone();
      building1.scale.set(15, 25, 12);
      building1.position.set(-35, 0, -25);
      building1.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // 调整材质
          if (child.material) {
            child.material.roughness = 0.7;
            child.material.metalness = 0.2;
            child.material.color = new THREE.Color(0x5BA3D0);
          }
        }
      });
      this.scene.add(building1);

      // Building 2 - 控制中心
      const building2 = this.loadedModels[1].model.clone();
      building2.scale.set(14, 18, 14);
      building2.position.set(35, 0, -25);
      building2.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.roughness = 0.7;
            child.material.metalness = 0.15;
            child.material.color = new THREE.Color(0x6BC9B8);
          }
        }
      });
      this.scene.add(building2);
    }

    // Road system
    this.createRoads();

    // Landing pad
    this.createLandingPad();

    // Landscaping
    this.createLandscape();
  }

  createRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B95A0,
      roughness: 0.85,
      metalness: 0.1
    });

    // Main road
    const mainRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 12),
      roadMaterial
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.y = 0.02;
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    // Cross road
    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 120),
      roadMaterial
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.y = 0.02;
    crossRoad.receiveShadow = true;
    this.scene.add(crossRoad);

    // Sidewalks
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

    // Center lines
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
    // Main pad
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

    // Ring marking
    const ringGeometry = new THREE.RingGeometry(9, 9.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 20);
    this.scene.add(ring);

    // H marking
    const hMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Horizontal bar
    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), hMaterial);
    h1.rotation.x = -Math.PI / 2;
    h1.position.set(0, 0.07, 20);
    this.scene.add(h1);

    // Left vertical
    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), hMaterial);
    h2.rotation.x = -Math.PI / 2;
    h2.position.set(-1.7, 0.07, 20);
    this.scene.add(h2);

    // Right vertical
    const h3 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), hMaterial);
    h3.rotation.x = -Math.PI / 2;
    h3.position.set(1.7, 0.07, 20);
    this.scene.add(h3);
  }

  createLandscape() {
    // Trees around the scene
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

    // Bushes
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

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.65, 4.5, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x6B4423,
      roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2.25;
    trunk.castShadow = true;
    tree.add(trunk);

    // Crown (3 layers)
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
