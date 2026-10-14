/**
 * Three.js Scene Manager
 * Initialize scene, camera, lights, renderer
 */

import * as THREE from 'three';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.init();
  }

  init() {
    // Scene - Bright daylight atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);  // Sky blue
    this.scene.fog = new THREE.Fog(0xB0D4F1, 120, 350);  // Soft blue fog for depth

    // Camera (isometric-like angle for stylized look)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
    this.camera.position.set(-90, 70, 90);
    this.camera.lookAt(0, 0, 0);

    // Renderer (cartoon/stylized quality)
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
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLights();

    // Create ground and environment
    this.createGround();
    this.createBuildings();
    this.createSky();

    // Responsive
    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    // Bright ambient light for cartoon look
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.7);
    this.scene.add(ambient);

    // Main sun light (warm, bright)
    const sunLight = new THREE.DirectionalLight(0xFFFAE3, 2.2);
    sunLight.position.set(80, 120, 60);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0001;
    this.scene.add(sunLight);

    // Sky fill light (soft blue)
    const skyLight = new THREE.DirectionalLight(0xB0D4F1, 1.0);
    skyLight.position.set(-50, 40, -50);
    this.scene.add(skyLight);

    // Hemisphere light (sky to ground gradient)
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xA8D5BA, 1.2);
    this.scene.add(hemiLight);
  }

  createGround() {
    // Stylized cartoon ground with grass
    const groundGeometry = new THREE.PlaneGeometry(100, 100, 1, 1);

    // Create bright grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base grass green
    ctx.fillStyle = '#76D78B';
    ctx.fillRect(0, 0, 256, 256);

    // Add grass texture variation
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const brightness = Math.floor(Math.random() * 30 + 100);
      ctx.fillStyle = `rgb(${brightness - 40}, ${brightness}, ${brightness - 20})`;
      ctx.fillRect(x, y, 3, 3);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.0,
      color: 0xFFFFFF
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road markings
    this.createRoadMarkings();

    // Trees
    this.createTrees();

    // Parking lots
    this.createParkingLots();
  }

  createRoadMarkings() {
    // White road markings
    const whiteLine = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Main road center line (horizontal)
    const centerLineGeometry = new THREE.PlaneGeometry(100, 0.3);
    const centerLine = new THREE.Mesh(centerLineGeometry, whiteLine);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.11, 0);
    this.scene.add(centerLine);

    // Cross road center line (vertical)
    const crossLineGeometry = new THREE.PlaneGeometry(0.3, 100);
    const crossLine = new THREE.Mesh(crossLineGeometry, whiteLine);
    crossLine.rotation.x = -Math.PI / 2;
    crossLine.position.set(0, 0.11, 0);
    this.scene.add(crossLine);

    // Dashed lines (parking area)
    for (let i = -40; i <= 40; i += 10) {
      const dashGeometry = new THREE.PlaneGeometry(0.2, 4);
      const dash1 = new THREE.Mesh(dashGeometry, whiteLine);
      dash1.rotation.x = -Math.PI / 2;
      dash1.position.set(i, 0.11, -20);
      this.scene.add(dash1);

      const dash2 = new THREE.Mesh(dashGeometry, whiteLine);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(i, 0.11, 20);
      this.scene.add(dash2);
    }
  }


  createTrees() {
    // Create trees along roads and buildings
    const treePositions = [
      // Left side trees
      { x: -45, z: -40 }, { x: -45, z: -30 }, { x: -45, z: -20 }, { x: -45, z: -10 },
      { x: -45, z: 0 }, { x: -45, z: 10 }, { x: -45, z: 20 }, { x: -45, z: 30 },
      // Right side trees
      { x: 45, z: -40 }, { x: 45, z: -30 }, { x: 45, z: -20 }, { x: 45, z: -10 },
      { x: 45, z: 0 }, { x: 45, z: 10 }, { x: 45, z: 20 }, { x: 45, z: 30 },
      // Top side trees
      { x: -40, z: 45 }, { x: -30, z: 45 }, { x: -20, z: 45 }, { x: -10, z: 45 },
      { x: 0, z: 45 }, { x: 10, z: 45 }, { x: 20, z: 45 }, { x: 30, z: 45 },
      // Bottom side trees
      { x: -40, z: -45 }, { x: -30, z: -45 }, { x: -20, z: -45 }, { x: -10, z: -45 },
      { x: 0, z: -45 }, { x: 10, z: -45 }, { x: 20, z: -45 }, { x: 30, z: -45 },
    ];

    treePositions.forEach(pos => {
      const tree = new THREE.Group();

      // Tree trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
      const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4A3520,
        roughness: 0.9
      });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 1.5;
      trunk.castShadow = true;
      tree.add(trunk);

      // Tree crown (3 cones)
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: 0x2D5016,
        roughness: 0.8
      });

      for (let i = 0; i < 3; i++) {
        const foliageGeometry = new THREE.ConeGeometry(1.5 - i * 0.3, 2.5, 8);
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 3.5 + i * 1.5;
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
      opacity: 0.6
    });

    // Left parking area
    for (let i = 0; i < 6; i++) {
      const parkingGeometry = new THREE.PlaneGeometry(4, 2.5);
      const parking = new THREE.Mesh(parkingGeometry, parkingMaterial);
      parking.rotation.x = -Math.PI / 2;
      parking.position.set(-35, 0.11, -25 + i * 5);
      this.scene.add(parking);

      // Parking lines
      const lineGeometry = new THREE.PlaneGeometry(4, 0.1);
      const line1 = new THREE.Mesh(lineGeometry, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      line1.rotation.x = -Math.PI / 2;
      line1.position.set(-35, 0.12, -26.25 + i * 5);
      this.scene.add(line1);

      const line2 = new THREE.Mesh(lineGeometry, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      line2.rotation.x = -Math.PI / 2;
      line2.position.set(-35, 0.12, -23.75 + i * 5);
      this.scene.add(line2);
    }

    // Right parking area
    for (let i = 0; i < 6; i++) {
      const parkingGeometry = new THREE.PlaneGeometry(4, 2.5);
      const parking = new THREE.Mesh(parkingGeometry, parkingMaterial);
      parking.rotation.x = -Math.PI / 2;
      parking.position.set(35, 0.11, -25 + i * 5);
      this.scene.add(parking);

      const lineGeometry = new THREE.PlaneGeometry(4, 0.1);
      const line1 = new THREE.Mesh(lineGeometry, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      line1.rotation.x = -Math.PI / 2;
      line1.position.set(35, 0.12, -26.25 + i * 5);
      this.scene.add(line1);

      const line2 = new THREE.Mesh(lineGeometry, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      line2.rotation.x = -Math.PI / 2;
      line2.position.set(35, 0.12, -23.75 + i * 5);
      this.scene.add(line2);
    }
  }

  createGreenAreas() {
    // Add green grass areas with texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base grass color
    ctx.fillStyle = '#4A7C59';
    ctx.fillRect(0, 0, 256, 256);

    // Add grass texture noise
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const green = Math.floor(Math.random() * 30 + 60);
      ctx.fillStyle = `rgb(40, ${green}, 45)`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const grassMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95
    });

    const greenSpots = [
      { x: -40, z: -40, size: 8 },
      { x: 40, z: -40, size: 6 },
      { x: -40, z: 40, size: 7 },
      { x: 40, z: 40, size: 8 },
    ];

    greenSpots.forEach(spot => {
      const grassGeometry = new THREE.CircleGeometry(spot.size, 16);
      const grass = new THREE.Mesh(grassGeometry, grassMaterial);
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(spot.x, 0.12, spot.z);
      grass.receiveShadow = true;
      this.scene.add(grass);
    });
  }

  createBuildings() {
    // Create 6 stylized cartoon buildings with vibrant colors
    const buildingConfigs = [
      { x: -30, z: -30, width: 15, height: 15, depth: 15, color: 0x74B9FF, roofColor: 0xFFB45E },
      { x: 30, z: -30, width: 12, height: 20, depth: 12, color: 0xFFF2DC, roofColor: 0xFFB45E },
      { x: -35, z: 25, width: 18, height: 12, depth: 18, color: 0x74B9FF, roofColor: 0xFF9A6C },
      { x: 25, z: 30, width: 14, height: 25, depth: 14, color: 0xFFE5CC, roofColor: 0xFFB45E },
      { x: -15, z: 0, width: 10, height: 10, depth: 10, color: 0x9DD4FF, roofColor: 0xFFA366 },
      { x: 20, z: 5, width: 8, height: 18, depth: 8, color: 0xFFF2DC, roofColor: 0xFF9966 }
    ];

    buildingConfigs.forEach((config, index) => {
      const building = new THREE.Group();

      // Clone texture for each building
      const texture = buildingTexture.clone();
      texture.needsUpdate = true;
      texture.repeat.set(config.width / 5, config.height / 5);

      // Main building with texture
      const mainGeometry = new THREE.BoxGeometry(config.width, config.height, config.depth);
      const mainMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        color: config.color,
        roughness: 0.85,
        metalness: 0.05,
        envMapIntensity: 0.5
      });
      const mainBuilding = new THREE.Mesh(mainGeometry, mainMaterial);
      mainBuilding.castShadow = true;
      mainBuilding.receiveShadow = true;
      building.add(mainBuilding);

      // Windows (detailed glass effect)
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2332,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0x4080ff,
        emissiveIntensity: 0.15
      });
      const windowSize = 1.0;
      const windowSpacing = 2.2;

      // Front and back windows
      for (let y = 2; y < config.height - 2; y += windowSpacing) {
        for (let x = -config.width/2 + 2; x < config.width/2 - 2; x += windowSpacing) {
          const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);
          const windowFront = new THREE.Mesh(windowGeometry, windowMaterial);
          windowFront.position.set(x, y - config.height/2, config.depth/2 + 0.02);
          building.add(windowFront);

          const windowBack = new THREE.Mesh(windowGeometry, windowMaterial);
          windowBack.position.set(x, y - config.height/2, -config.depth/2 - 0.02);
          windowBack.rotation.y = Math.PI;
          building.add(windowBack);
        }
      }

      // Left and right windows
      for (let y = 2; y < config.height - 2; y += windowSpacing) {
        for (let z = -config.depth/2 + 2; z < config.depth/2 - 2; z += windowSpacing) {
          const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);
          const windowLeft = new THREE.Mesh(windowGeometry, windowMaterial);
          windowLeft.position.set(-config.width/2 - 0.02, y - config.height/2, z);
          windowLeft.rotation.y = Math.PI / 2;
          building.add(windowLeft);

          const windowRight = new THREE.Mesh(windowGeometry, windowMaterial);
          windowRight.position.set(config.width/2 + 0.02, y - config.height/2, z);
          windowRight.rotation.y = -Math.PI / 2;
          building.add(windowRight);
        }
      }

      // Roof (dark with subtle lighting)
      const roofGeometry = new THREE.BoxGeometry(config.width + 0.5, 0.8, config.depth + 0.5);
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        roughness: 0.9,
        metalness: 0.1
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
    // Bright stylized sky gradient (cartoon aesthetic)
    const skyGradient = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(0x8ED8FF) },  // Sky blue
          bottomColor: { value: new THREE.Color(0xEAF8FF) }  // Light blue-white
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
