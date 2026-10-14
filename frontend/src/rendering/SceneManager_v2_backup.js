/**
 * Three.js Scene Manager - Enhanced Detailed Version
 * Structured cartoon city with rich details
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
    this.scene.background = new THREE.Color(0x91CEF2);  // Sky blue (not too light)
    this.scene.fog = new THREE.Fog(0x91CEF2, 180, 400);  // Reduced fog density

    // Camera - Optimized composition
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
    this.camera.position.set(-90, 70, 90);
    this.camera.lookAt(0, 0, 0);

    // Renderer - Fixed tone mapping to prevent overexposure
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
    this.renderer.toneMappingExposure = 1.0;  // REDUCED from 1.3 to fix overexposure
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
    // Reduced ambient for proper contrast
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.5);  // Reduced from 0.8
    this.scene.add(ambient);

    // Main sun light (warm but not too strong)
    const sunLight = new THREE.DirectionalLight(0xFFF1CF, 1.8);  // Reduced from 2.5
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

    // Sky fill light (reduced)
    const skyLight = new THREE.DirectionalLight(0xB0D4F1, 0.6);  // Reduced from 1.2
    skyLight.position.set(-50, 40, -50);
    this.scene.add(skyLight);

    // Hemisphere light (balanced)
    const hemiLight = new THREE.HemisphereLight(0x91CEF2, 0x65C87A, 0.8);  // Reduced from 1.5
    this.scene.add(hemiLight);
  }

  createGround() {
    // Vibrant grass ground (not washed out)
    const groundGeometry = new THREE.PlaneGeometry(120, 120, 1, 1);

    // Create saturated grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base vibrant grass color
    ctx.fillStyle = '#65C87A';
    ctx.fillRect(0, 0, 256, 256);

    // Add texture variation with proper contrast
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
    texture.repeat.set(10, 10);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.0
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road and environment
    this.createRoadMarkings();
    this.createTrees();
    this.createParkingLots();
  }

  createRoadMarkings() {
    // Roads with proper gray color (not too light)
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x929FA9,
      roughness: 0.9,
      metalness: 0.0
    });

    // Main horizontal road
    const roadH = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 8),
      roadMaterial
    );
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.05;
    roadH.receiveShadow = true;
    this.scene.add(roadH);

    // Main vertical road
    const roadV = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 100),
      roadMaterial
    );
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.05;
    roadV.receiveShadow = true;
    this.scene.add(roadV);

    // White road markings
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Center line horizontal
    const centerLineH = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 0.3),
      lineMaterial
    );
    centerLineH.rotation.x = -Math.PI / 2;
    centerLineH.position.y = 0.11;
    this.scene.add(centerLineH);

    // Center line vertical
    const centerLineV = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 100),
      lineMaterial
    );
    centerLineV.rotation.x = -Math.PI / 2;
    centerLineV.position.y = 0.11;
    this.scene.add(centerLineV);

    // Dashed lines for parking areas
    for (let i = -40; i <= 40; i += 10) {
      const dash1 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 4),
        lineMaterial
      );
      dash1.rotation.x = -Math.PI / 2;
      dash1.position.set(i, 0.11, 20);
      this.scene.add(dash1);

      const dash2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 4),
        lineMaterial
      );
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(i, 0.11, -20);
      this.scene.add(dash2);
    }
  }

  createTrees() {
    // Vibrant cartoon trees
    const treePositions = [
      // Left side
      { x: -45, z: -40 }, { x: -45, z: -30 }, { x: -45, z: -20 }, { x: -45, z: -10 },
      { x: -45, z: 0 }, { x: -45, z: 10 }, { x: -45, z: 20 }, { x: -45, z: 30 },
      // Right side
      { x: 45, z: -40 }, { x: 45, z: -30 }, { x: 45, z: -20 }, { x: 45, z: -10 },
      { x: 45, z: 0 }, { x: 45, z: 10 }, { x: 45, z: 20 }, { x: 45, z: 30 },
      // Top side
      { x: -40, z: 45 }, { x: -30, z: 45 }, { x: -20, z: 45 }, { x: -10, z: 45 },
      { x: 0, z: 45 }, { x: 10, z: 45 }, { x: 20, z: 45 }, { x: 30, z: 45 },
      // Bottom side
      { x: -40, z: -45 }, { x: -30, z: -45 }, { x: -20, z: -45 }, { x: -10, z: -45 },
      { x: 0, z: -45 }, { x: 10, z: -45 }, { x: 20, z: -45 }, { x: 30, z: -45 },
    ];

    treePositions.forEach((pos, index) => {
      const tree = new THREE.Group();

      // Tree trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.5, 3.5, 8);
      const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x6B4423,
        roughness: 0.95
      });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 1.75;
      trunk.castShadow = true;
      tree.add(trunk);

      // Tree crown - vibrant green with variation
      const crownColor = index % 3 === 0 ? 0x37B66B : (index % 3 === 1 ? 0x24985A : 0x4FD187);
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: crownColor,
        roughness: 0.85
      });

      // Multiple layers for volume
      for (let i = 0; i < 3; i++) {
        const foliageGeometry = new THREE.SphereGeometry(2.0 - i * 0.4, 8, 8);
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 4.5 + i * 1.2;
        foliage.castShadow = true;
        tree.add(foliage);
      }

      tree.position.set(pos.x, 0, pos.z);
      this.scene.add(tree);
    });
  }

  createParkingLots() {
    // Parking lot markings
    const parkingMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.7
    });

    // Left parking
    for (let i = 0; i < 6; i++) {
      const parking = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2.5),
        parkingMaterial
      );
      parking.rotation.x = -Math.PI / 2;
      parking.position.set(-35, 0.12, -25 + i * 5);
      this.scene.add(parking);
    }

    // Right parking
    for (let i = 0; i < 6; i++) {
      const parking = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2.5),
        parkingMaterial
      );
      parking.rotation.x = -Math.PI / 2;
      parking.position.set(35, 0.12, -25 + i * 5);
      this.scene.add(parking);
    }
  }

  createBuildings() {
    // Vibrant cartoon buildings with varied colors
    const buildingConfigs = [
      { x: -30, z: -30, width: 15, height: 15, depth: 15, color: 0x65ACEA, roofColor: 0x427FA9 },
      { x: 30, z: -30, width: 12, height: 20, depth: 12, color: 0xF3E4CC, roofColor: 0xF3A26B },
      { x: -35, z: 25, width: 18, height: 12, depth: 18, color: 0x48BEB0, roofColor: 0x2A7D72 },
      { x: 25, z: 30, width: 14, height: 25, depth: 14, color: 0xF3E4CC, roofColor: 0xF3A26B },
      { x: -15, z: 0, width: 10, height: 10, depth: 10, color: 0x65ACEA, roofColor: 0x427FA9 },
      { x: 20, z: 5, width: 8, height: 18, depth: 8, color: 0xF5D5B0, roofColor: 0xF3A26B }
    ];

    buildingConfigs.forEach((config) => {
      const building = new THREE.Group();

      // Main building body
      const mainGeometry = new THREE.BoxGeometry(config.width, config.height, config.depth);
      const mainMaterial = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.7,
        metalness: 0.0
      });
      const mainBuilding = new THREE.Mesh(mainGeometry, mainMaterial);
      mainBuilding.castShadow = true;
      mainBuilding.receiveShadow = true;
      building.add(mainBuilding);

      // Windows - saturated blue glass
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x4AAFE0,  // More saturated blue
        emissive: 0x2563AA,
        emissiveIntensity: 0.15,
        roughness: 0.3,
        metalness: 0.1
      });

      const windowSize = 1.2;
      const windowSpacing = 2.8;

      // Front and back windows
      for (let y = 3; y < config.height - 2; y += windowSpacing) {
        for (let x = -config.width/2 + 2.5; x < config.width/2 - 2; x += windowSpacing) {
          // Window frame
          const frameGeometry = new THREE.PlaneGeometry(windowSize + 0.3, windowSize * 1.5 + 0.3);
          const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8 });

          const frameFront = new THREE.Mesh(frameGeometry, frameMaterial);
          frameFront.position.set(x, y - config.height/2, config.depth/2 + 0.01);
          building.add(frameFront);

          const windowFront = new THREE.Mesh(
            new THREE.PlaneGeometry(windowSize, windowSize * 1.5),
            windowMaterial
          );
          windowFront.position.set(x, y - config.height/2, config.depth/2 + 0.02);
          building.add(windowFront);

          // Back windows
          const frameBack = new THREE.Mesh(frameGeometry, frameMaterial);
          frameBack.position.set(x, y - config.height/2, -config.depth/2 - 0.01);
          frameBack.rotation.y = Math.PI;
          building.add(frameBack);

          const windowBack = new THREE.Mesh(
            new THREE.PlaneGeometry(windowSize, windowSize * 1.5),
            windowMaterial
          );
          windowBack.position.set(x, y - config.height/2, -config.depth/2 - 0.02);
          windowBack.rotation.y = Math.PI;
          building.add(windowBack);
        }
      }

      // Side windows
      for (let y = 3; y < config.height - 2; y += windowSpacing) {
        for (let z = -config.depth/2 + 2.5; z < config.depth/2 - 2; z += windowSpacing) {
          const frameGeometry = new THREE.PlaneGeometry(windowSize + 0.3, windowSize * 1.5 + 0.3);
          const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8 });

          const frameLeft = new THREE.Mesh(frameGeometry, frameMaterial);
          frameLeft.position.set(-config.width/2 - 0.01, y - config.height/2, z);
          frameLeft.rotation.y = Math.PI / 2;
          building.add(frameLeft);

          const windowLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(windowSize, windowSize * 1.5),
            windowMaterial
          );
          windowLeft.position.set(-config.width/2 - 0.02, y - config.height/2, z);
          windowLeft.rotation.y = Math.PI / 2;
          building.add(windowLeft);

          const frameRight = new THREE.Mesh(frameGeometry, frameMaterial);
          frameRight.position.set(config.width/2 + 0.01, y - config.height/2, z);
          frameRight.rotation.y = -Math.PI / 2;
          building.add(frameRight);

          const windowRight = new THREE.Mesh(
            new THREE.PlaneGeometry(windowSize, windowSize * 1.5),
            windowMaterial
          );
          windowRight.position.set(config.width/2 + 0.02, y - config.height/2, z);
          windowRight.rotation.y = -Math.PI / 2;
          building.add(windowRight);
        }
      }

      // Roof with vibrant color
      const roofGeometry = new THREE.BoxGeometry(config.width + 1, 1.5, config.depth + 1);
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: config.roofColor,
        roughness: 0.8,
        metalness: 0.0
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.y = config.height / 2;
      roof.castShadow = true;
      building.add(roof);

      building.position.set(config.x, config.height / 2, config.z);
      this.scene.add(building);
    });
  }

  createSky() {
    // Vibrant sky gradient (not washed out)
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

  // Camera control
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
