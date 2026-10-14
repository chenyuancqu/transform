/**
 * Three.js Scene Manager - Enhanced with Rich Details
 * Structured cartoon city with performance optimization
 */

import * as THREE from 'three';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.init();
  }

  init() {
    // Scene - Proper bright atmosphere without overexposure
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x91CEF2);
    this.scene.fog = new THREE.Fog(0x91CEF2, 180, 400);

    // Camera - Better composition
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 500);
    this.camera.position.set(-100, 80, 100);
    this.camera.lookAt(0, 5, 0);

    // Renderer - Fixed tone mapping
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
    this.setupLights();

    // Create scene elements
    this.createGround();
    this.createBuildings();
    this.createSky();

    // Responsive
    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.5);
    this.scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xFFF1CF, 1.8);
    sunLight.position.set(80, 120, 60);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.00005;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);

    const skyLight = new THREE.DirectionalLight(0xB0D4F1, 0.6);
    skyLight.position.set(-50, 40, -50);
    this.scene.add(skyLight);

    const hemiLight = new THREE.HemisphereLight(0x91CEF2, 0x65C87A, 0.8);
    this.scene.add(hemiLight);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(140, 140, 1, 1);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#65C87A';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const variation = Math.random() > 0.5 ? '#37B66B' : '#4FD187';
      ctx.fillStyle = variation;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 12);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.createRoadSystem();
    this.createTrees();
    this.createEnvironmentDetails();
  }

  createRoadSystem() {
    // Main roads with better structure
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x929FA9,
      roughness: 0.9,
      metalness: 0.0
    });

    // Horizontal road
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(100, 9), roadMaterial);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.05;
    roadH.receiveShadow = true;
    this.scene.add(roadH);

    // Vertical road
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(9, 100), roadMaterial);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.05;
    roadV.receiveShadow = true;
    this.scene.add(roadV);

    // Sidewalks (人行道)
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xE7DED0,
      roughness: 0.95
    });

    // Horizontal sidewalks
    [-6, 6].forEach(offset => {
      const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(100, 1.5), sidewalkMaterial);
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(0, 0.06, offset);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    });

    // Vertical sidewalks
    [-6, 6].forEach(offset => {
      const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 100), sidewalkMaterial);
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(offset, 0.06, 0);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    });

    // Road markings
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Center lines
    const centerLineH = new THREE.Mesh(new THREE.PlaneGeometry(100, 0.25), lineMaterial);
    centerLineH.rotation.x = -Math.PI / 2;
    centerLineH.position.y = 0.11;
    this.scene.add(centerLineH);

    const centerLineV = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 100), lineMaterial);
    centerLineV.rotation.x = -Math.PI / 2;
    centerLineV.position.y = 0.11;
    this.scene.add(centerLineV);

    // Crosswalks (人行横道)
    this.createCrosswalk(0, 8);
    this.createCrosswalk(0, -8);
    this.createCrosswalk(8, 0, true);
    this.createCrosswalk(-8, 0, true);
  }

  createCrosswalk(x, z, vertical = false) {
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const numStrips = 5;
    const stripWidth = vertical ? 1.2 : 0.8;
    const stripLength = vertical ? 0.8 : 1.2;
    const spacing = vertical ? 1.0 : 1.0;

    for (let i = 0; i < numStrips; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(stripWidth, stripLength),
        stripMaterial
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(
        x + (vertical ? 0 : (i - 2) * spacing),
        0.11,
        z + (vertical ? (i - 2) * spacing : 0)
      );
      this.scene.add(strip);
    }
  }

  createBuildings() {
    const buildingConfigs = [
      { x: -30, z: -30, width: 15, height: 15, depth: 15, color: 0x65ACEA, roofColor: 0x427FA9 },
      { x: 30, z: -30, width: 12, height: 20, depth: 12, color: 0xF3E4CC, roofColor: 0xF3A26B },
      { x: -35, z: 25, width: 18, height: 12, depth: 18, color: 0x48BEB0, roofColor: 0x2A7D72 },
      { x: 25, z: 30, width: 14, height: 25, depth: 14, color: 0xF3E4CC, roofColor: 0xF3A26B },
      { x: -15, z: 0, width: 10, height: 10, depth: 10, color: 0x65ACEA, roofColor: 0x427FA9 },
      { x: 20, z: 5, width: 8, height: 18, depth: 8, color: 0xF5D5B0, roofColor: 0xF3A26B }
    ];

    buildingConfigs.forEach((config) => {
      const building = this.createDetailedBuilding(config);
      building.position.set(config.x, 0, config.z);
      this.scene.add(building);
    });
  }

  createDetailedBuilding(config) {
    const building = new THREE.Group();

    // 1. Base platform
    const baseGeometry = new THREE.BoxGeometry(config.width + 1, 0.8, config.depth + 1);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.color).multiplyScalar(0.7),
      roughness: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.4;
    base.castShadow = true;
    base.receiveShadow = true;
    building.add(base);

    // 2. Main building body
    const mainGeometry = new THREE.BoxGeometry(config.width, config.height, config.depth);
    const mainMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.7,
      metalness: 0.0
    });
    const mainBuilding = new THREE.Mesh(mainGeometry, mainMaterial);
    mainBuilding.position.y = config.height / 2 + 0.8;
    mainBuilding.castShadow = true;
    mainBuilding.receiveShadow = true;
    building.add(mainBuilding);

    // 3. Floor divisions
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.9
    });

    const numFloors = Math.floor(config.height / 3);
    for (let i = 1; i < numFloors; i++) {
      const floorY = (i * 3) + 0.8;
      const floorLine = new THREE.Mesh(
        new THREE.BoxGeometry(config.width + 0.1, 0.15, config.depth + 0.1),
        floorMaterial
      );
      floorLine.position.y = floorY;
      building.add(floorLine);
    }

    // 4. Entrance
    const entranceGeometry = new THREE.BoxGeometry(2.5, 3, 0.3);
    const entranceMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.9
    });
    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, 1.5 + 0.8, config.depth / 2 + 0.15);
    building.add(entrance);

    // Door
    const doorGeometry = new THREE.PlaneGeometry(1.5, 2.5);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x5D4E37,
      roughness: 0.8
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1.5 + 0.8, config.depth / 2 + 0.31);
    building.add(door);

    // 5. Roof with eaves
    const roofGeometry = new THREE.BoxGeometry(config.width + 1.5, 1.5, config.depth + 1.5);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: config.roofColor,
      roughness: 0.8,
      metalness: 0.0
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = config.height + 1.5 + 0.8;
    roof.castShadow = true;
    building.add(roof);

    // Roof top
    const roofTopGeometry = new THREE.BoxGeometry(config.width + 0.5, 0.4, config.depth + 0.5);
    const roofTop = new THREE.Mesh(roofTopGeometry, roofMaterial);
    roofTop.position.y = config.height + 2.3 + 0.8;
    building.add(roofTop);

    // 6. Windows using InstancedMesh for performance
    this.addInstancedWindows(building, config);

    return building;
  }

  addInstancedWindows(building, config) {
    const windowSize = 1.2;
    const windowSpacing = 2.8;
    const positions = [];
    const rotations = [];

    // Front
    for (let y = 4; y < config.height - 1; y += windowSpacing) {
      for (let x = -config.width/2 + 2.5; x < config.width/2 - 2; x += windowSpacing) {
        positions.push([x, y + 0.8, config.depth/2 + 0.02]);
        rotations.push(0);
      }
    }

    // Back
    for (let y = 4; y < config.height - 1; y += windowSpacing) {
      for (let x = -config.width/2 + 2.5; x < config.width/2 - 2; x += windowSpacing) {
        positions.push([x, y + 0.8, -config.depth/2 - 0.02]);
        rotations.push(Math.PI);
      }
    }

    // Sides
    for (let y = 4; y < config.height - 1; y += windowSpacing) {
      for (let z = -config.depth/2 + 2.5; z < config.depth/2 - 2; z += windowSpacing) {
        positions.push([-config.width/2 - 0.02, y + 0.8, z]);
        rotations.push(Math.PI / 2);

        positions.push([config.width/2 + 0.02, y + 0.8, z]);
        rotations.push(-Math.PI / 2);
      }
    }

    if (positions.length === 0) return;

    // Create instanced mesh
    const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x4AAFE0,
      emissive: 0x2563AA,
      emissiveIntensity: 0.15,
      roughness: 0.3,
      metalness: 0.1
    });

    const instancedWindows = new THREE.InstancedMesh(
      windowGeometry,
      windowMaterial,
      positions.length
    );

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    positions.forEach((pos, i) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotations[i]);
      matrix.compose(
        new THREE.Vector3(pos[0], pos[1], pos[2]),
        quaternion,
        new THREE.Vector3(1, 1, 1)
      );
      instancedWindows.setMatrixAt(i, matrix);
    });

    instancedWindows.instanceMatrix.needsUpdate = true;
    building.add(instancedWindows);
  }

  createTrees() {
    // Varied tree positions with randomization
    const treeBasePositions = [
      // Perimeter with variation
      ...this.generateTreeLine(-48, -45, -40, 40, 10, 'x'),
      ...this.generateTreeLine(48, -45, -40, 40, 10, 'x'),
      ...this.generateTreeLine(-40, 48, -40, 40, 10, 'z'),
      ...this.generateTreeLine(-40, -48, -40, 40, 10, 'z'),
    ];

    // Create 3 types of trees using instanced meshes
    this.createInstancedTrees(treeBasePositions);
  }

  generateTreeLine(fixedCoord, start, end, step, axis) {
    const positions = [];
    for (let pos = start; pos <= end; pos += step) {
      const offset = (Math.random() - 0.5) * 3;
      if (axis === 'x') {
        positions.push({ x: fixedCoord + offset, z: pos + (Math.random() - 0.5) * 2 });
      } else {
        positions.push({ x: pos + (Math.random() - 0.5) * 2, z: fixedCoord + offset });
      }
    }
    return positions;
  }

  createInstancedTrees(positions) {
    const treeTypes = [
      { trunkH: 3.5, crownR: 2.0, color: 0x37B66B },
      { trunkH: 4.0, crownR: 2.2, color: 0x24985A },
      { trunkH: 3.0, crownR: 1.8, color: 0x4FD187 }
    ];

    positions.forEach((pos, index) => {
      const typeIndex = index % 3;
      const type = treeTypes[typeIndex];
      const tree = new THREE.Group();

      // Trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.5, type.trunkH, 8);
      const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x6B4423,
        roughness: 0.95
      });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = type.trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      // Crown - layered for volume
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: type.color,
        roughness: 0.85
      });

      for (let i = 0; i < 3; i++) {
        const foliageGeometry = new THREE.SphereGeometry(type.crownR - i * 0.3, 8, 8);
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = type.trunkH + 1.5 + i * 0.8;
        foliage.castShadow = true;
        tree.add(foliage);
      }

      // Random rotation and slight scale variation
      tree.rotation.y = Math.random() * Math.PI * 2;
      const scale = 0.9 + Math.random() * 0.2;
      tree.scale.set(scale, scale, scale);

      tree.position.set(pos.x, 0, pos.z);
      this.scene.add(tree);
    });
  }

  createEnvironmentDetails() {
    // Add small bushes around buildings
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x4FD187,
      roughness: 0.9
    });

    const bushPositions = [
      { x: -25, z: -25 }, { x: -35, z: -25 }, { x: 25, z: -25 }, { x: 35, z: -25 },
      { x: -25, z: 30 }, { x: -40, z: 30 }, { x: 30, z: 35 }, { x: 20, z: 35 }
    ];

    bushPositions.forEach(pos => {
      const bushGeometry = new THREE.SphereGeometry(0.8, 6, 6);
      const bush = new THREE.Mesh(bushGeometry, bushMaterial);
      bush.position.set(pos.x, 0.6, pos.z);
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.scene.add(bush);
    });
  }

  createSky() {
    const skyGradient = new THREE.Mesh(
      new THREE.SphereGeometry(250, 32, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(0x91CEF2) },
          bottomColor: { value: new THREE.Color(0xD4E8F7) }
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
            gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
          }
        `,
        side: THREE.BackSide
      })
    );
    this.scene.add(skyGradient);
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
        this.camera.position.set(0, 120, 120);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'follow':
        if (target) {
          this.camera.position.set(target.x, target.y + 20, target.z + 30);
          this.camera.lookAt(target.x, target.y, target.z);
        }
        break;
    }
  }
}
