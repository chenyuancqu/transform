/**
 * 主程序入口 - 全新架构
 * 业务逻辑与视觉呈现完全解耦
 */

import { AIEngine } from './core/AIEngine.js';
import { SimulationState } from './core/SimulationState.js';
import { TechCampusScene, SCENE_CONFIG } from './rendering/TechCampusScene.js';
import { VehicleRenderer } from './rendering/VehicleRenderer.js';
import { UAVRenderer } from './rendering/UAVRenderer.js';
import { OrderRenderer } from './rendering/OrderRenderer.js';
import Stats from 'stats.js';

class DigitalTwinSimulation {
  constructor() {
    this.isRunning = false;
    this.simulationSpeed = 1.0;
    this.cameraMode = 'overview';

    // 核心模块
    this.aiEngine = new AIEngine();
    this.state = new SimulationState();

    // 新场景系统
    this.scene = null;
    this.vehicleRenderer = null;
    this.uavRenderers = [];
    this.orderRenderer = null;

    // 性能监控
    this.stats = null;
    this.performanceMonitor = null;

    // 帧率控制
    this.lastFrameTime = null;

    // UI元素
    this.loadingEl = document.getElementById('loading');
    this.controlPanel = document.getElementById('control-panel');
    this.statsPanel = document.getElementById('stats-panel');

    this.init();
  }

  async init() {
    try {
      // 初始化性能监控
      this.initPerformanceMonitor();

      // 加载AI模型
      await this.aiEngine.loadModels();

      // 隐藏加载界面
      this.loadingEl.style.display = 'none';
      this.controlPanel.style.display = 'block';
      this.statsPanel.style.display = 'block';

      // 初始化全新3D场景
      const container = document.getElementById('canvas-container');
      this.scene = new TechCampusScene(container);

      // 创建业务设备渲染器（使用新的坐标转换）
      this.vehicleRenderer = new VehicleRenderer(this.scene.scene);

      // 创建3架无人机
      for (let i = 1; i <= 3; i++) {
        const uavRenderer = new UAVRenderer(this.scene.scene, i);
        this.uavRenderers.push(uavRenderer);
      }

      // 创建订单标记
      this.orderRenderer = new OrderRenderer(this.scene.scene, this.state.orders);

      // 绑定UI事件
      this.bindUIEvents();

      // 启动渲染循环
      this.animate();

      console.log('✅ 全新数字孪生系统初始化完成！');
      console.log('📊 场景配置:', SCENE_CONFIG);
    } catch (error) {
      console.error('初始化失败:', error);
      this.loadingEl.innerHTML = `<h2 style="color: #EF4444;">加载失败</h2><p>${error.message}</p>`;
    }
  }

  initPerformanceMonitor() {
    // Stats.js for FPS
    this.stats = new Stats();
    this.stats.showPanel(0);
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.right = '10px';
    this.stats.dom.style.top = '10px';
    this.stats.dom.style.left = 'auto';
    document.body.appendChild(this.stats.dom);

    // Custom performance panel
    this.performanceMonitor = {
      frameTime: 0,
      renderTime: 0,
      aiTime: 0,
      objects: 0,
      triangles: 0,
      calls: 0
    };

    // Create custom performance display
    const perfDiv = document.createElement('div');
    perfDiv.id = 'performance-stats';
    perfDiv.style.position = 'absolute';
    perfDiv.style.right = '10px';
    perfDiv.style.top = '90px';
    perfDiv.style.background = 'rgba(0, 15, 30, 0.85)';
    perfDiv.style.color = '#00ffcc';
    perfDiv.style.fontFamily = '"Courier New", monospace';
    perfDiv.style.fontSize = '12px';
    perfDiv.style.padding = '12px';
    perfDiv.style.borderRadius = '4px';
    perfDiv.style.minWidth = '220px';
    perfDiv.style.zIndex = '10000';
    perfDiv.style.border = '1px solid rgba(0, 255, 204, 0.3)';
    perfDiv.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
    document.body.appendChild(perfDiv);
    this.performanceDiv = perfDiv;
  }

  bindUIEvents() {
    // 播放/暂停/重置
    document.getElementById('btn-play').addEventListener('click', () => {
      this.isRunning = true;
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      this.isRunning = false;
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      this.reset();
    });

    // 速度滑块
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.addEventListener('input', (e) => {
      this.simulationSpeed = parseFloat(e.target.value);
      speedValue.textContent = this.simulationSpeed.toFixed(1) + 'x';
    });

    // 摄像机视角
    document.getElementById('camera-mode').addEventListener('change', (e) => {
      this.cameraMode = e.target.value;
    });
  }

  reset() {
    this.isRunning = false;
    this.state.reset();

    // 重置渲染器位置（转换到世界坐标）
    this.vehicleRenderer.update(this.state.rover.x, this.state.rover.y, false);

    this.uavRenderers.forEach((renderer, i) => {
      const uav = this.state.uavs[i];
      renderer.update(uav.x, uav.y, uav.z, uav.battery);
      renderer.trailPoints = [];
    });

    // 重建订单
    this.orderRenderer.orderMeshes.forEach(mesh => {
      this.scene.scene.remove(mesh);
    });
    this.orderRenderer = new OrderRenderer(this.scene.scene, this.state.orders);

    this.updateStats();
    console.log('🔄 仿真已重置');
  }

  async simulationStep() {
    if (!this.isRunning) return;

    try {
      // 执行AI推理
      const result = await this.aiEngine.step(this.state);

      // 订单完成事件
      if (result.completedOrders.length > 0) {
        result.completedOrders.forEach(event => {
          console.log(`✅ UAV-${event.uavId} 完成订单 #${event.orderId}`);
        });
      }

      // 充电事件
      if (result.chargingUAVs.length > 0) {
        result.chargingUAVs.forEach(uavId => {
          console.log(`🔋 UAV-${uavId} 正在充电`);
        });
      }

    } catch (error) {
      console.error('仿真步骤执行失败:', error);
      this.isRunning = false;
    }
  }

  updateRenderers() {
    // 更新母车
    const isAnyUAVCharging = this.state.uavs.some(uav => {
      const dist = Math.sqrt(
        Math.pow(uav.x - this.state.rover.x, 2) +
        Math.pow(uav.y - this.state.rover.y, 2)
      );
      return dist < 0.08 && uav.z < 0.05;
    });
    this.vehicleRenderer.update(this.state.rover.x, this.state.rover.y, isAnyUAVCharging);

    // 更新无人机
    this.uavRenderers.forEach((renderer, i) => {
      const uav = this.state.uavs[i];
      renderer.update(uav.x, uav.y, uav.z, uav.battery);
    });

    // 更新订单
    this.orderRenderer.update(this.state.orders);
  }

  updateCamera() {
    switch (this.cameraMode) {
      case 'overview':
        this.scene.setCameraMode('overview');
        break;
      case 'follow-rover':
        this.scene.setCameraMode('follow', this.state.rover);
        break;
      case 'follow-uav1':
        this.scene.setCameraMode('follow', this.state.uavs[0]);
        break;
      case 'follow-uav2':
        this.scene.setCameraMode('follow', this.state.uavs[1]);
        break;
      case 'follow-uav3':
        this.scene.setCameraMode('follow', this.state.uavs[2]);
        break;
    }
  }

  updateStats() {
    const stats = this.state.stats;

    // 安全更新DOM元素（如果存在）
    const updateElement = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    updateElement('stat-steps', stats.stepCount);
    updateElement('stat-completion', Math.round((stats.completedOrders / 8) * 100) + '%');
    updateElement('stat-orders', `${stats.completedOrders} / 8`);
    updateElement('stat-battery', (this.state.getAverageBattery() * 100).toFixed(0) + '%');
    updateElement('stat-charges', stats.totalCharges);
    updateElement('stat-rover-dist', (stats.roverTotalDistance * 100).toFixed(1) + 'm');
    updateElement('stat-uav-dist', (stats.uavTotalDistance * 100).toFixed(1) + 'm');
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // 固定30fps帧率控制
    const targetFPS = 30;
    const targetFrameTime = 1000 / targetFPS; // 33.33ms per frame
    const now = performance.now();

    if (!this.lastFrameTime) {
      this.lastFrameTime = now;
    }

    const elapsed = now - this.lastFrameTime;

    // 如果距离上一帧时间不足，跳过本次渲染
    if (elapsed < targetFrameTime) {
      return;
    }

    // 更新上一帧时间（考虑累积误差）
    this.lastFrameTime = now - (elapsed % targetFrameTime);

    // Start performance monitoring
    this.stats.begin();
    const frameStart = performance.now();

    // AI inference timing
    const aiStart = performance.now();
    if (this.isRunning && Math.random() < this.simulationSpeed * 0.3) {
      this.simulationStep();
    }
    this.performanceMonitor.aiTime = performance.now() - aiStart;

    // Update renderers
    this.updateRenderers();
    this.updateCamera();
    this.updateStats();

    // Render scene timing
    const renderStart = performance.now();
    this.scene.render();
    this.performanceMonitor.renderTime = performance.now() - renderStart;

    // Collect renderer info
    const renderer = this.scene.renderer;
    const info = renderer.info;
    this.performanceMonitor.objects = info.render.calls;
    this.performanceMonitor.triangles = info.render.triangles;
    this.performanceMonitor.calls = info.render.calls;
    this.performanceMonitor.frameTime = performance.now() - frameStart;

    // Update performance display
    this.updatePerformanceDisplay();

    // End performance monitoring
    this.stats.end();
  }

  updatePerformanceDisplay() {
    const pm = this.performanceMonitor;

    this.performanceDiv.innerHTML = `
      <div style="color: #00ffcc; font-weight: bold; margin-bottom: 8px; font-size: 13px;">⚡ PERFORMANCE</div>
      <div style="line-height: 1.6;">
        <div><span style="color: #8899aa;">Frame:</span> <span style="color: #fff; font-weight: bold;">${pm.frameTime.toFixed(1)}ms</span></div>
        <div><span style="color: #8899aa;">Render:</span> <span style="color: #fff; font-weight: bold;">${pm.renderTime.toFixed(1)}ms</span></div>
        <div><span style="color: #8899aa;">AI:</span> <span style="color: #fff; font-weight: bold;">${pm.aiTime.toFixed(1)}ms</span></div>
      </div>
      <div style="margin-top: 8px; border-top: 1px solid rgba(0, 255, 204, 0.2); padding-top: 8px; line-height: 1.6;">
        <div><span style="color: #8899aa;">Calls:</span> <span style="color: #fff;">${pm.calls}</span></div>
        <div><span style="color: #8899aa;">Triangles:</span> <span style="color: #fff;">${(pm.triangles / 1000).toFixed(1)}K</span></div>
        <div><span style="color: #8899aa;">Memory:</span> <span style="color: #fff;">${(performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'N/A')}MB</span></div>
      </div>
    `;
  }
}

// 启动应用
const simulation = new DigitalTwinSimulation();
// Development-only audit handle; does not change simulation timing or state.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('audit')) {
  window.__campusBaseline = simulation;
}
