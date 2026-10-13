import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMPUS_ASSETS } from './assetManifest.js';

const ASSET_URL = CAMPUS_ASSETS.mainBuilding.url;

const VIEW_PRESETS = {
  angle: { position: new THREE.Vector3(31, 24, 34), target: new THREE.Vector3(0, 10, 0) },
  front: { position: new THREE.Vector3(0, 17, 54), target: new THREE.Vector3(0, 10, 0) },
  back: { position: new THREE.Vector3(0, 18, -54), target: new THREE.Vector3(0, 10, 0) },
  roof: { position: new THREE.Vector3(31, 44, 38), target: new THREE.Vector3(0, 9, 0) }
};

function countModelStats(root) {
  const stats = { meshes: 0, materials: 0, triangles: 0, textures: 0 };
  const materials = new Set();
  const textures = new Set();

  root.traverse((node) => {
    if (!node.isMesh) return;
    stats.meshes += 1;
    const geometry = node.geometry;
    const index = geometry.getIndex();
    stats.triangles += index ? index.count / 3 : (geometry.attributes.position?.count || 0) / 3;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.forEach((material) => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });

  stats.materials = materials.size;
  stats.textures = textures.size;
  return stats;
}

export class SingleBuildingPreview {
  constructor(container, hud) {
    this.container = container;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dbe8ef');
    this.scene.fog = new THREE.Fog('#dbe8ef', 110, 220);
    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.modelLoaded = false;
    this.viewKey = 'angle';
    this.initRenderer();
    this.initCamera();
    this.initLights();
    this.createTestGround();
    this.loadBuilding();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 320);
    this.camera.position.copy(VIEW_PRESETS.angle.position);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 130;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.copy(VIEW_PRESETS.angle.target);
  }

  initLights() {
    this.scene.add(new THREE.HemisphereLight('#f6fbff', '#8b9a9c', 1.7));
    const sun = new THREE.DirectionalLight('#fff5e6', 3.1);
    sun.position.set(42, 72, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 180;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#c8e4ff', 1.15);
    fill.position.set(-44, 25, -36);
    this.scene.add(fill);
  }

  createTestGround() {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(86, 0.45, 86),
      new THREE.MeshStandardMaterial({ color: '#c7d0d0', roughness: 0.92, metalness: 0.02 })
    );
    slab.position.y = -0.35;
    slab.receiveShadow = true;
    this.scene.add(slab);

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(66, 66),
      new THREE.MeshStandardMaterial({ color: '#e7ecea', roughness: 0.8, metalness: 0.02 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.1;
    pad.receiveShadow = true;
    this.scene.add(pad);

    const grid = new THREE.GridHelper(66, 22, '#c4cecd', '#d8dfde');
    grid.position.y = -0.08;
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    this.scene.add(grid);
  }

  async loadBuilding() {
    this.hud.setStatus('正在加载真实 GLB…', 'loading');
    try {
      const gltf = await new GLTFLoader().loadAsync(ASSET_URL);
      const model = gltf.scene;
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((material) => {
            material.envMapIntensity = 0.65;
            if ('roughness' in material && material.roughness < 0.18) material.roughness = 0.24;
          });
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const height = size.y || 1;
      const desiredHeight = 26;
      const scale = desiredHeight / height;
      const placement = new THREE.Group();
      placement.add(model);
      model.position.x -= center.x;
      model.position.y -= box.min.y;
      model.position.z -= center.z;
      placement.scale.setScalar(scale);
      this.modelRoot.add(placement);
      this.model = model;
      this.modelLoaded = true;
      this.modelStats = countModelStats(model);
      const scaledBox = new THREE.Box3().setFromObject(this.modelRoot);
      this.bounds = scaledBox;
      this.assetLoadedAtMs = performance.now();
      this.normalizationScale = scale;
      this.originalDimensions = size;
      this.modelDimensions = scaledBox.getSize(new THREE.Vector3());
      this.hud.setAssetStats(this.modelDimensions, this.modelStats);
      this.hud.setStatus('GLB 已加载 · 可旋转检查', 'ready');
      this.setView('angle');
    } catch (error) {
      console.error(error);
      this.hud.setStatus(`GLB 加载失败：${error.message}`, 'error');
    }
  }

  setView(viewKey) {
    const preset = VIEW_PRESETS[viewKey] || VIEW_PRESETS.angle;
    this.viewKey = viewKey;
    if (!this.bounds) return;
    const center = this.bounds.getCenter(new THREE.Vector3());
    const direction = preset.position.clone().sub(preset.target).normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanHorizontal = tanVertical * this.camera.aspect;
    let distance = 0;
    for (const x of [this.bounds.min.x, this.bounds.max.x]) {
      for (const y of [this.bounds.min.y, this.bounds.max.y]) {
        for (const z of [this.bounds.min.z, this.bounds.max.z]) {
          const relative = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(distance, relative.dot(direction) + Math.max(
            Math.abs(relative.dot(right)) / (tanHorizontal * 0.72),
            Math.abs(relative.dot(up)) / (tanVertical * 0.8)
          ));
        }
      }
    }
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.controls.update();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.setView(this.viewKey);
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info;
    this.hud.setRendererStats({ calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures });
  }

  dispose() {
    this.renderer.dispose();
    this.controls.dispose();
    window.removeEventListener('resize', this.onResize);
  }
}

export { ASSET_URL };
