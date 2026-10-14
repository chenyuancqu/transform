/**
 * 全新的智慧科技园区场景
 * Premium Cartoon Technology Campus
 *
 * 设计理念：
 * - 现代科技园区风格
 * - 精致卡通渲染
 * - 明亮温暖的日间光照
 * - 丰富的建筑细节和景观层次
 * - 与业务逻辑完全解耦
 */

import * as THREE from 'three';
import { businessToWorld, worldToBusiness } from './CoordinateSystem.js';

// 场景配置常量
const SCENE_CONFIG = {
  // 世界坐标系统（米）
  worldSize: 200,          // 场景总尺寸
  centerX: 0,
  centerZ: 0,

  // 归一化坐标映射
  // 业务坐标(0-1) 映射到 世界坐标(-100, 100)
  coordScale: 200,
  coordOffset: -100,

  // 建筑区域（保留业务空间）
  buildingZones: [
    { x: -60, z: -60, width: 30, depth: 30, height: 25, type: 'office' },      // 左下大楼
    { x: 60, z: -60, width: 25, depth: 25, height: 35, type: 'research' },     // 右下研发楼
    { x: -65, z: 50, width: 35, depth: 30, height: 20, type: 'control' },      // 左上控制中心
    { x: 50, z: 55, width: 28, depth: 28, height: 40, type: 'headquarters' },  // 右上总部
    { x: -30, z: 0, width: 20, depth: 20, height: 15, type: 'service' },       // 中左服务楼
    { x: 40, z: 10, width: 16, depth: 16, height: 28, type: 'tech' }           // 中右科技楼
  ],

  // 道路系统
  roads: {
    mainWidth: 12,
    secondaryWidth: 8,
    sidewalkWidth: 2.5
  },

  // 颜色系统
  colors: {
    sky: 0x87CEEB,
    skyHorizon: 0xE0F4FF,
    grass: 0x5DBD6F,
    grassDark: 0x4A9B5C,
    grassLight: 0x7FD990,
    road: 0x8B95A0,
    sidewalk: 0xDDD5C7,
    buildingBlue: 0x5BA3D0,
    buildingCream: 0xF5E6D3,
    buildingGreen: 0x6BC9B8,
    buildingOrange: 0xF5A962,
    roofDark: 0x4A6B8A,
    window: 0x4A9FD8,
    windowFrame: 0xFFFFFF
  }
};

export class TechCampusScene {
  constructor(container) {
    this.container = container;
    this.buildings = [];
    this.trees = [];
    this.decorations = [];

    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_CONFIG.colors.sky);
    this.scene.fog = new THREE.Fog(SCENE_CONFIG.colors.skyHorizon, 250, 500);

    // Camera - Isometric-like view
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 1000);
    this.camera.position.set(-180, 150, 180);
    this.camera.lookAt(0, 10, 0);

    // Renderer with proper color management
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
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Lighting system
    this.setupLighting();

    // Create scene elements
    this.createEnvironment();
    this.createBuildings();
    this.createLandscape();
    this.createSky();

    // Responsive
    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Warm ambient light
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.6);
    this.scene.add(ambient);

    // Main sun (warm daylight)
    const sun = new THREE.DirectionalLight(0xFFFAF0, 2.0);
    sun.position.set(100, 150, 80);
    sun.castShadow = true;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 400;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);

    // Sky hemisphere light
    const hemi = new THREE.HemisphereLight(
      SCENE_CONFIG.colors.sky,
      SCENE_CONFIG.colors.grass,
      1.0
    );
    this.scene.add(hemi);

    // Subtle fill light
    const fill = new THREE.DirectionalLight(0xB8D4F0, 0.4);
    fill.position.set(-60, 40, -60);
    this.scene.add(fill);
  }

  createEnvironment() {
    // Ground plane with rich texture
    const groundSize = SCENE_CONFIG.worldSize * 1.2;
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);

    // Create grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base color
    ctx.fillStyle = '#5DBD6F';
    ctx.fillRect(0, 0, 512, 512);

    // Add texture details
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = Math.random();
      if (shade < 0.3) {
        ctx.fillStyle = '#4A9B5C';
      } else if (shade < 0.6) {
        ctx.fillStyle = '#7FD990';
      } else {
        ctx.fillStyle = '#6BC97C';
      }
      ctx.fillRect(x, y, 2, 2);
    }

    const grassTexture = new THREE.CanvasTexture(canvas);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(15, 15);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: grassTexture,
      roughness: 0.9,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road system
    this.createRoadNetwork();

    // Central plaza
    this.createCentralPlaza();
  }

  createRoadNetwork() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: SCENE_CONFIG.colors.road,
      roughness: 0.8,
      metalness: 0.1
    });

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: SCENE_CONFIG.colors.sidewalk,
      roughness: 0.9
    });

    // Main horizontal road
    const mainRoadH = new THREE.Mesh(
      new THREE.PlaneGeometry(180, SCENE_CONFIG.roads.mainWidth),
      roadMaterial
    );
    mainRoadH.rotation.x = -Math.PI / 2;
    mainRoadH.position.y = 0.02;
    mainRoadH.receiveShadow = true;
    this.scene.add(mainRoadH);

    // Main vertical road
    const mainRoadV = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_CONFIG.roads.mainWidth, 180),
      roadMaterial
    );
    mainRoadV.rotation.x = -Math.PI / 2;
    mainRoadV.position.y = 0.02;
    mainRoadV.receiveShadow = true;
    this.scene.add(mainRoadV);

    // Sidewalks (4 sides of main roads)
    const sw = SCENE_CONFIG.roads.sidewalkWidth;
    const halfMain = SCENE_CONFIG.roads.mainWidth / 2;

    [-halfMain - sw/2, halfMain + sw/2].forEach(offset => {
      // Horizontal sidewalks
      const sidewalkH = new THREE.Mesh(
        new THREE.PlaneGeometry(180, sw),
        sidewalkMaterial
      );
      sidewalkH.rotation.x = -Math.PI / 2;
      sidewalkH.position.set(0, 0.03, offset);
      sidewalkH.receiveShadow = true;
      this.scene.add(sidewalkH);

      // Vertical sidewalks
      const sidewalkV = new THREE.Mesh(
        new THREE.PlaneGeometry(sw, 180),
        sidewalkMaterial
      );
      sidewalkV.rotation.x = -Math.PI / 2;
      sidewalkV.position.set(offset, 0.03, 0);
      sidewalkV.receiveShadow = true;
      this.scene.add(sidewalkV);
    });

    // Road markings
    this.createRoadMarkings();
  }

  createRoadMarkings() {
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Center lines
    const centerLineH = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 0.3),
      lineMaterial
    );
    centerLineH.rotation.x = -Math.PI / 2;
    centerLineH.position.y = 0.05;
    this.scene.add(centerLineH);

    const centerLineV = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 180),
      lineMaterial
    );
    centerLineV.rotation.x = -Math.PI / 2;
    centerLineV.position.y = 0.05;
    this.scene.add(centerLineV);

    // Crosswalks at intersections
    this.createCrosswalk(0, 10);
    this.createCrosswalk(0, -10);
    this.createCrosswalk(10, 0, true);
    this.createCrosswalk(-10, 0, true);
  }

  createCrosswalk(x, z, vertical = false) {
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const numStrips = 6;
    const stripWidth = vertical ? 1.5 : 1.0;
    const stripLength = vertical ? 1.0 : 1.5;
    const spacing = 1.2;

    for (let i = 0; i < numStrips; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(stripWidth, stripLength),
        stripMaterial
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(
        x + (vertical ? 0 : (i - 2.5) * spacing),
        0.05,
        z + (vertical ? (i - 2.5) * spacing : 0)
      );
      this.scene.add(strip);
    }
  }

  createCentralPlaza() {
    // Central drone hub area
    const plazaSize = 30;
    const plazaGeometry = new THREE.CircleGeometry(plazaSize, 32);
    const plazaMaterial = new THREE.MeshStandardMaterial({
      color: 0xC8D5E0,
      roughness: 0.7,
      metalness: 0.2
    });

    const plaza = new THREE.Mesh(plazaGeometry, plazaMaterial);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.04;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Landing pads
    this.createLandingPads(plazaSize - 10);
  }

  createLandingPads(radius) {
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BA8D8,
      roughness: 0.6,
      emissive: 0x4A8AC8,
      emissiveIntensity: 0.1
    });

    const angles = [0, 120, 240];
    angles.forEach(angle => {
      const rad = (angle * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const z = Math.sin(rad) * radius;

      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(3, 16),
        padMaterial
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.06, z);
      this.scene.add(pad);

      // Pad marking
      const markingGeometry = new THREE.RingGeometry(2.5, 2.8, 16);
      const markingMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        side: THREE.DoubleSide
      });
      const marking = new THREE.Mesh(markingGeometry, markingMaterial);
      marking.rotation.x = -Math.PI / 2;
      marking.position.set(x, 0.07, z);
      this.scene.add(marking);
    });
  }

  createBuildings() {
    SCENE_CONFIG.buildingZones.forEach(zone => {
      const building = this.createModernBuilding(zone);
      building.position.set(zone.x, 0, zone.z);
      this.scene.add(building);
      this.buildings.push(building);
    });
  }

  createModernBuilding(config) {
    const building = new THREE.Group();

    // Building color based on type
    const colorMap = {
      'office': SCENE_CONFIG.colors.buildingBlue,
      'research': SCENE_CONFIG.colors.buildingCream,
      'control': SCENE_CONFIG.colors.buildingGreen,
      'headquarters': SCENE_CONFIG.colors.buildingBlue,
      'service': SCENE_CONFIG.colors.buildingOrange,
      'tech': SCENE_CONFIG.colors.buildingCream
    };

    const mainColor = colorMap[config.type] || SCENE_CONFIG.colors.buildingBlue;

    // Base platform
    const baseHeight = 1.5;
    const baseGeometry = new THREE.BoxGeometry(
      config.width + 2,
      baseHeight,
      config.depth + 2
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(mainColor).multiplyScalar(0.6),
      roughness: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = baseHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    building.add(base);

    // Main body (with setback for taller buildings)
    const floors = Math.floor(config.height / 4);
    let currentY = baseHeight;
    let currentWidth = config.width;
    let currentDepth = config.depth;

    for (let floor = 0; floor < floors; floor++) {
      const floorHeight = 4;

      // Setback every 3 floors for tall buildings
      if (floor > 0 && floor % 3 === 0 && config.height > 20) {
        currentWidth *= 0.9;
        currentDepth *= 0.9;
      }

      const floorGeometry = new THREE.BoxGeometry(
        currentWidth,
        floorHeight,
        currentDepth
      );
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: mainColor,
        roughness: 0.7,
        metalness: 0.1
      });

      const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
      floorMesh.position.y = currentY + floorHeight / 2;
      floorMesh.castShadow = true;
      floorMesh.receiveShadow = true;
      building.add(floorMesh);

      // Floor separation line
      if (floor < floors - 1) {
        const separator = new THREE.Mesh(
          new THREE.BoxGeometry(currentWidth + 0.2, 0.2, currentDepth + 0.2),
          new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 })
        );
        separator.position.y = currentY + floorHeight;
        building.add(separator);
      }

      currentY += floorHeight;
    }

    // Roof
    this.addBuildingRoof(building, currentWidth, currentDepth, currentY, config);

    // Windows (instanced for performance)
    this.addBuildingWindows(building, config, floors);

    // Entrance
    this.addBuildingEntrance(building, config, baseHeight);

    return building;
  }

  addBuildingRoof(building, width, depth, height, config) {
    const roofHeight = 2;
    const roofGeometry = new THREE.BoxGeometry(width + 1, roofHeight, depth + 1);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: SCENE_CONFIG.colors.roofDark,
      roughness: 0.8
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + roofHeight / 2;
    roof.castShadow = true;
    building.add(roof);

    // Roof equipment (AC units, etc.)
    if (config.height > 15) {
      const equipmentGeometry = new THREE.BoxGeometry(3, 1.5, 2);
      const equipmentMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B95A0,
        roughness: 0.6,
        metalness: 0.3
      });

      const equipment = new THREE.Mesh(equipmentGeometry, equipmentMaterial);
      equipment.position.set(width / 3, height + roofHeight + 0.75, 0);
      equipment.castShadow = true;
      building.add(equipment);
    }
  }

  addBuildingWindows(building, config, floors) {
    // Windows will be added here using InstancedMesh
    // This is a placeholder - full implementation needed
    const windowPositions = [];

    let currentY = 1.5; // After base
    let currentWidth = config.width;
    let currentDepth = config.depth;

    for (let floor = 0; floor < floors; floor++) {
      const floorHeight = 4;
      const windowY = currentY + floorHeight / 2;

      // Front and back
      for (let x = -currentWidth/2 + 3; x < currentWidth/2 - 2; x += 3) {
        windowPositions.push({ x, y: windowY, z: currentDepth/2, rot: 0 });
        windowPositions.push({ x, y: windowY, z: -currentDepth/2, rot: Math.PI });
      }

      // Sides
      for (let z = -currentDepth/2 + 3; z < currentDepth/2 - 2; z += 3) {
        windowPositions.push({ x: currentWidth/2, y: windowY, z, rot: -Math.PI/2 });
        windowPositions.push({ x: -currentWidth/2, y: windowY, z, rot: Math.PI/2 });
      }

      if (floor > 0 && floor % 3 === 0 && config.height > 20) {
        currentWidth *= 0.9;
        currentDepth *= 0.9;
      }

      currentY += floorHeight;
    }

    // Create instanced windows
    if (windowPositions.length > 0) {
      const windowGeometry = new THREE.PlaneGeometry(1.5, 2);
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: SCENE_CONFIG.colors.window,
        emissive: SCENE_CONFIG.colors.window,
        emissiveIntensity: 0.2,
        roughness: 0.2,
        metalness: 0.3
      });

      const instancedWindows = new THREE.InstancedMesh(
        windowGeometry,
        windowMaterial,
        windowPositions.length
      );

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();

      windowPositions.forEach((pos, i) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pos.rot);
        matrix.compose(
          new THREE.Vector3(pos.x, pos.y, pos.z),
          quaternion,
          new THREE.Vector3(1, 1, 1)
        );
        instancedWindows.setMatrixAt(i, matrix);
      });

      instancedWindows.instanceMatrix.needsUpdate = true;
      building.add(instancedWindows);
    }
  }

  addBuildingEntrance(building, config, baseHeight) {
    const entranceWidth = 4;
    const entranceHeight = 3;
    const entranceDepth = 1;

    const entranceGeometry = new THREE.BoxGeometry(
      entranceWidth,
      entranceHeight,
      entranceDepth
    );
    const entranceMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.8
    });

    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, baseHeight + entranceHeight / 2, config.depth / 2 + entranceDepth / 2);
    entrance.castShadow = true;
    building.add(entrance);

    // Door
    const doorGeometry = new THREE.PlaneGeometry(2, 2.5);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x5D4E37,
      roughness: 0.6,
      metalness: 0.2
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, baseHeight + 1.5, config.depth / 2 + entranceDepth + 0.01);
    building.add(door);
  }

  createLandscape() {
    // Strategic tree placement
    this.plantTreeGroups();
    this.addEnvironmentDetails();
  }

  plantTreeGroups() {
    const treeConfigs = [
      // Around buildings
      { center: [-60, -60], radius: 15, count: 8, type: 'large' },
      { center: [60, -60], radius: 12, count: 6, type: 'medium' },
      { center: [-65, 50], radius: 12, count: 6, type: 'large' },
      { center: [50, 55], radius: 15, count: 8, type: 'large' },

      // Along roads
      { center: [-80, 0], radius: 8, count: 10, type: 'small', line: true },
      { center: [80, 0], radius: 8, count: 10, type: 'small', line: true },
      { center: [0, -80], radius: 8, count: 10, type: 'small', line: true },
      { center: [0, 80], radius: 8, count: 10, type: 'small', line: true }
    ];

    treeConfigs.forEach(config => {
      if (config.line) {
        this.createTreeLine(config);
      } else {
        this.createTreeCluster(config);
      }
    });
  }

  createTreeCluster(config) {
    const [cx, cz] = config.center;

    for (let i = 0; i < config.count; i++) {
      const angle = (i / config.count) * Math.PI * 2;
      const r = config.radius * (0.7 + Math.random() * 0.3);
      const x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 5;
      const z = cz + Math.sin(angle) * r + (Math.random() - 0.5) * 5;

      const tree = this.createStylizedTree(config.type);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      const scale = 0.8 + Math.random() * 0.4;
      tree.scale.set(scale, scale, scale);

      this.scene.add(tree);
      this.trees.push(tree);
    }
  }

  createTreeLine(config) {
    const [cx, cz] = config.center;
    const isVertical = Math.abs(cx) > Math.abs(cz);

    for (let i = 0; i < config.count; i++) {
      const pos = -40 + (i / (config.count - 1)) * 80;
      const offset = (Math.random() - 0.5) * 4;

      const x = isVertical ? cx + offset : pos;
      const z = isVertical ? pos : cz + offset;

      const tree = this.createStylizedTree(config.type);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      const scale = 0.7 + Math.random() * 0.3;
      tree.scale.set(scale, scale, scale);

      this.scene.add(tree);
      this.trees.push(tree);
    }
  }

  createStylizedTree(type) {
    const tree = new THREE.Group();

    const typeConfig = {
      'large': { trunkH: 4.5, crownR: 3.5, color: 0x4A9B5C },
      'medium': { trunkH: 3.5, crownR: 2.8, color: 0x5DBD6F },
      'small': { trunkH: 3.0, crownR: 2.2, color: 0x7FD990 }
    };

    const config = typeConfig[type] || typeConfig['medium'];

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.6, config.trunkH, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x6B4423,
      roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = config.trunkH / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Crown layers
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.85
    });

    for (let i = 0; i < 3; i++) {
      const r = config.crownR - i * 0.5;
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 8),
        foliageMaterial
      );
      crown.position.y = config.trunkH + 1.5 + i * 1.2;
      crown.castShadow = true;
      tree.add(crown);
    }

    return tree;
  }

  addEnvironmentDetails() {
    // Bushes, benches, etc.
    const bushPositions = [
      [-40, -40], [40, -40], [-40, 40], [40, 40],
      [-20, -50], [20, -50], [-50, 20], [50, -20]
    ];

    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x6BC97C,
      roughness: 0.9
    });

    bushPositions.forEach(([x, z]) => {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 8),
        bushMaterial
      );
      bush.position.set(x, 0.8, z);
      bush.castShadow = true;
      this.scene.add(bush);
    });
  }

  createSky() {
    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(SCENE_CONFIG.colors.sky) },
        bottomColor: { value: new THREE.Color(SCENE_CONFIG.colors.skyHorizon) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(h * 0.6 + 0.4, 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  setCameraMode(mode, target = null) {
    switch (mode) {
      case 'overview':
        this.camera.position.set(-180, 150, 180);
        this.camera.lookAt(0, 10, 0);
        break;
      case 'follow':
        if (target) {
          const worldPos = businessToWorld(target.x, target.y, target.z || 0);
          this.camera.position.set(
            worldPos.x - 30,
            worldPos.y + 25,
            worldPos.z + 30
          );
          this.camera.lookAt(worldPos.x, worldPos.y, worldPos.z);
        }
        break;
    }
  }
}

export { SCENE_CONFIG };
