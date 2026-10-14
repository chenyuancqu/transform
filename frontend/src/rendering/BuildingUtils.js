/**
 * Enhanced Building Creation with Details
 * - Base/Platform
 * - Entrance
 * - Floor divisions
 * - Detailed roof with eaves
 * - Instanced windows for performance
 */

export function createDetailedBuilding(config, scene) {
  const building = new THREE.Group();

  // 1. Base/Platform (建筑底座)
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

  // 3. Floor division lines (楼层分隔线)
  const floorDivisionMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.9
  });

  const numFloors = Math.floor(config.height / 3);
  for (let i = 1; i < numFloors; i++) {
    const floorY = (i * 3) + 0.8;
    const floorLine = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.1, 0.15, config.depth + 0.1),
      floorDivisionMaterial
    );
    floorLine.position.y = floorY;
    building.add(floorLine);
  }

  // 4. Entrance (入口)
  const entranceWidth = 2.5;
  const entranceHeight = 3;
  const entranceGeometry = new THREE.BoxGeometry(entranceWidth, entranceHeight, 0.3);
  const entranceMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.9
  });
  const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
  entrance.position.set(0, entranceHeight / 2 + 0.8, config.depth / 2 + 0.15);
  building.add(entrance);

  // 5. Door
  const doorGeometry = new THREE.PlaneGeometry(1.5, 2.5);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x5D4E37,
    roughness: 0.8
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 1.5 + 0.8, config.depth / 2 + 0.31);
  building.add(door);

  // 6. Roof with eaves (带屋檐的屋顶)
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

  // Roof top detail (屋顶装饰)
  const roofTopGeometry = new THREE.BoxGeometry(config.width + 0.5, 0.4, config.depth + 0.5);
  const roofTop = new THREE.Mesh(roofTopGeometry, roofMaterial);
  roofTop.position.y = config.height + 2.3 + 0.8;
  building.add(roofTop);

  return building;
}

export function addInstancedWindows(building, config, scene) {
  const windowSize = 1.2;
  const windowSpacing = 2.8;

  // Calculate window positions
  const windowPositions = [];
  const windowNormals = [];

  // Front windows
  for (let y = 3; y < config.height - 2; y += windowSpacing) {
    for (let x = -config.width/2 + 2.5; x < config.width/2 - 2; x += windowSpacing) {
      windowPositions.push(x, y + 0.8, config.depth/2 + 0.02);
      windowNormals.push(0, 0, 1);
    }
  }

  // Back windows
  for (let y = 3; y < config.height - 2; y += windowSpacing) {
    for (let x = -config.width/2 + 2.5; x < config.width/2 - 2; x += windowSpacing) {
      windowPositions.push(x, y + 0.8, -config.depth/2 - 0.02);
      windowNormals.push(0, 0, -1);
    }
  }

  // Side windows
  for (let y = 3; y < config.height - 2; y += windowSpacing) {
    for (let z = -config.depth/2 + 2.5; z < config.depth/2 - 2; z += windowSpacing) {
      windowPositions.push(-config.width/2 - 0.02, y + 0.8, z);
      windowNormals.push(-1, 0, 0);

      windowPositions.push(config.width/2 + 0.02, y + 0.8, z);
      windowNormals.push(1, 0, 0);
    }
  }

  // Create instanced mesh for windows
  const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x4AAFE0,
    emissive: 0x2563AA,
    emissiveIntensity: 0.15,
    roughness: 0.3,
    metalness: 0.1
  });

  const count = windowPositions.length / 3;
  const instancedWindows = new THREE.InstancedMesh(windowGeometry, windowMaterial, count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    const x = windowPositions[i * 3];
    const y = windowPositions[i * 3 + 1];
    const z = windowPositions[i * 3 + 2];
    const nx = windowNormals[i * 3];
    const ny = windowNormals[i * 3 + 1];
    const nz = windowNormals[i * 3 + 2];

    // Calculate rotation based on normal
    if (nz !== 0) {
      // Front/back
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), nz < 0 ? Math.PI : 0);
    } else {
      // Left/right
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), nx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(1, 1, 1));
    instancedWindows.setMatrixAt(i, matrix);
  }

  building.add(instancedWindows);
}
