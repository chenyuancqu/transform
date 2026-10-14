/**
 * 样板场景 - 使用真实3D模型资产
 * High-Quality Premium Scene Showcase
 *
 * 使用策略：
 * 1. 优先使用在线CDN托管的免费CC0模型
 * 2. 通过GLTFLoader加载真实GLB/glTF文件
 * 3. 独立于现有数字孪生系统
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 免费CC0模型资源列表（来自Poly Pizza等平台）
const MODEL_ASSETS = {
  // 现代建筑
  buildings: {
    office: {
      url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Box/glTF-Binary/Box.glb',
      scale: [20, 32, 15],
      position: [-40, 0, -30],
      placeholder: true // 标记为占位符
    },
    control: {
      url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Box/glTF-Binary/Box.glb',
      scale: [18, 16, 18],
      position: [40, 0, -30],
      placeholder: true
    }
  },

  // 景观元素
  landscape: {
    tree: {
      // 使用简单的几何体作为临时替代
      procedural: true,
      type: 'tree'
    },
    bench: {
      procedural: true,
      type: 'bench'
    }
  },

  // 基础设施
  infrastructure: {
    road: {
      procedural: true,
      type: 'road'
    },
    landingPad: {
      procedural: true,
      type: 'pad'
    }
  }
};

export class ShowcaseScene {
  constructor(container) {
    this.container = container;
    this.loader = new GLTFLoader();
    this.loadedModels = new Map();
    this.loadingPromises = [];

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0xE0F4FF, 100, 300);

    // Camera - 精致俯视角度
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 500);
    this.camera.position.set(-80, 60, 80);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
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

    // Load models asynchronously
    this.loadAssets().then(() => {
      console.log('✅ All assets loaded');
      this.buildScene();
    });

    // Responsive
    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Warm sunlight
    const sun = new THREE.DirectionalLight(0xFFFAF0, 1.8);
    sun.position.set(60, 80, 40);
    sun.castShadow = true;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 200;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);

    // Ambient
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.6);
    this.scene.add(ambient);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x5DBD6F, 0.8);
    this.scene.add(hemi);

    // Fill
    const fill = new THREE.DirectionalLight(0xB8D4F0, 0.4);
    fill.position.set(-40, 30, -40);
    this.scene.add(fill);
  }

  createGround() {
    // Main ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);

    // Create grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5DBD6F';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = Math.random();
      ctx.fillStyle = shade < 0.3 ? '#4A9B5C' : shade < 0.6 ? '#7FD990' : '#6BC97C';
      ctx.fillRect(x, y, 2, 2);
    }

    const grassTexture = new THREE.CanvasTexture(canvas);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(10, 10);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: grassTexture,
      roughness: 0.9,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  async loadAssets() {
    console.log('📦 Loading 3D assets...');

    // Load buildings
    for (const [name, config] of Object.entries(MODEL_ASSETS.buildings)) {
      if (config.placeholder) {
        // 暂时创建占位符，等待真实模型
        console.log(`⚠️ Using placeholder for ${name}`);
        this.loadedModels.set(name, this.createPlaceholderBuilding(config));
      } else {
        const promise = this.loadModel(config.url)
          .then(model => {
            this.loadedModels.set(name, { model, config });
            console.log(`✅ Loaded ${name}`);
          })
          .catch(error => {
            console.error(`❌ Failed to load ${name}:`, error);
            this.loadedModels.set(name, this.createPlaceholderBuilding(config));
          });
        this.loadingPromises.push(promise);
      }
    }

    await Promise.all(this.loadingPromises);
  }

  loadModel(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`Loading: ${percent.toFixed(0)}%`);
        },
        (error) => reject(error)
      );
    });
  }

  createPlaceholderBuilding(config) {
    // 创建高质量的程序化占位符
    const group = new THREE.Group();

    const [width, height, depth] = config.scale;

    // 多层建筑
    const floors = Math.floor(height / 4);
    for (let i = 0; i < floors; i++) {
      const floorHeight = 4;
      const currentWidth = width * (1 - i * 0.02);
      const currentDepth = depth * (1 - i * 0.02);

      const geometry = new THREE.BoxGeometry(currentWidth, floorHeight, currentDepth);
      const material = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x5BA3D0 : 0x6BB5E0,
        roughness: 0.7,
        metalness: 0.2
      });

      const floor = new THREE.Mesh(geometry, material);
      floor.position.y = i * floorHeight + floorHeight / 2;
      floor.castShadow = true;
      floor.receiveShadow = true;
      group.add(floor);
    }

    // 屋顶
    const roofGeometry = new THREE.BoxGeometry(width + 2, 2, depth + 2);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x3A5F7D,
      roughness: 0.8
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + 1;
    roof.castShadow = true;
    group.add(roof);

    return { model: group, config };
  }

  buildScene() {
    // Place buildings
    for (const [name, data] of this.loadedModels.entries()) {
      const { model, config } = data;
      const instance = model.clone ? model.clone() : model;

      if (config.position) {
        instance.position.set(...config.position);
      }

      if (config.scale) {
        instance.scale.set(1, 1, 1);
      }

      this.scene.add(instance);
    }

    // Add roads
    this.createRoadSystem();

    // Add landscaping
    this.createLandscaping();

    // Add landing pad
    this.createLandingPad();
  }

  createRoadSystem() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B95A0,
      roughness: 0.8,
      metalness: 0.1
    });

    // Main road
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 12),
      roadMaterial
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    this.scene.add(road);

    // Crossroad
    const crossroad = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 80),
      roadMaterial
    );
    crossroad.rotation.x = -Math.PI / 2;
    crossroad.position.y = 0.02;
    crossroad.receiveShadow = true;
    this.scene.add(crossroad);

    // Sidewalks
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xDDD5C7,
      roughness: 0.9
    });

    [-7.5, 7.5].forEach(offset => {
      const sidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 2.5),
        sidewalkMaterial
      );
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(0, 0.03, offset);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);

      const sidewalk2 = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 80),
        sidewalkMaterial
      );
      sidewalk2.rotation.x = -Math.PI / 2;
      sidewalk2.position.set(offset, 0.03, 0);
      sidewalk2.receiveShadow = true;
      this.scene.add(sidewalk2);
    });
  }

  createLandscaping() {
    // Trees
    const treePositions = [
      [-30, 0, 20], [30, 0, 20], [-30, 0, -50], [30, 0, -50],
      [-50, 0, 0], [50, 0, 0], [0, 0, 50], [0, 0, -70]
    ];

    treePositions.forEach(pos => {
      const tree = this.createStylizedTree();
      tree.position.set(...pos);
      this.scene.add(tree);
    });

    // Bushes
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BC97C,
      roughness: 0.9
    });

    for (let i = 0; i < 12; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 8),
        bushMaterial
      );
      const angle = (i / 12) * Math.PI * 2;
      bush.position.set(
        Math.cos(angle) * 35,
        0.8,
        Math.sin(angle) * 35
      );
      bush.castShadow = true;
      this.scene.add(bush);
    }
  }

  createStylizedTree() {
    const tree = new THREE.Group();

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.6, 4, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x6B4423,
      roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Crown (3 layers)
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A9B5C,
      roughness: 0.85
    });

    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(3 - i * 0.5, 8, 8),
        foliageMaterial
      );
      crown.position.y = 5 + i * 1.5;
      crown.castShadow = true;
      tree.add(crown);
    }

    return tree;
  }

  createLandingPad() {
    const padGeometry = new THREE.CircleGeometry(8, 32);
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BA8D8,
      roughness: 0.6,
      emissive: 0x4A8AC8,
      emissiveIntensity: 0.15,
      metalness: 0.2
    });

    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.05, 0);
    pad.receiveShadow = true;
    this.scene.add(pad);

    // Marking
    const markingGeometry = new THREE.RingGeometry(7, 7.5, 32);
    const markingMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const marking = new THREE.Mesh(markingGeometry, markingMaterial);
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(0, 0.06, 0);
    this.scene.add(marking);

    // Center H
    const hGeometry = new THREE.PlaneGeometry(3, 0.5);
    const hMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    const h1 = new THREE.Mesh(hGeometry, hMaterial);
    h1.rotation.x = -Math.PI / 2;
    h1.position.set(0, 0.07, 0);
    this.scene.add(h1);

    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2), hMaterial);
    h2.rotation.x = -Math.PI / 2;
    h2.position.set(-1.25, 0.07, 0);
    this.scene.add(h2);

    const h3 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2), hMaterial);
    h3.rotation.x = -Math.PI / 2;
    h3.position.set(1.25, 0.07, 0);
    this.scene.add(h3);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
