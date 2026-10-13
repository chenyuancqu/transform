/**
 * AI推理引擎
 * 加载ONNX模型并执行推理
 */

import * as ort from 'onnxruntime-web';
import { distanceMeters, moveTowards, pickupPose, returnPose } from './MissionRules.js';

export class AIEngine {
  constructor() {
    this.sessions = {};
    this.isLoaded = false;
  }

  async loadModels() {
    try {
      console.log('开始加载 ONNX 模型...');

      // 并行加载4个模型
      const [rover, uav1, uav2, uav3] = await Promise.all([
        ort.InferenceSession.create('/models/rover.onnx'),
        ort.InferenceSession.create('/models/uav_1.onnx'),
        ort.InferenceSession.create('/models/uav_2.onnx'),
        ort.InferenceSession.create('/models/uav_3.onnx')
      ]);

      this.sessions = { rover, uav1, uav2, uav3 };
      this.isLoaded = true;

      console.log('✅ 全部模型加载完成！');
      return true;
    } catch (error) {
      console.error('模型加载失败:', error);
      throw error;
    }
  }

  /**
   * 通用推理函数
   * @param {InferenceSession} session - ONNX会话
   * @param {Array} inputData - 输入数据数组
   * @param {Array} shape - 输入形状 [batch, features]
   * @returns {Float32Array} 动作向量
   */
  async predict(session, inputData, shape) {
    const tensor = new ort.Tensor('float32', Float32Array.from(inputData), shape);
    const results = await session.run({ observation: tensor });
    return results.action.data;
  }

  /**
   * 母车决策推理
   * @param {Object} state - 仿真状态
   * @returns {Float32Array} [dx, dy]
   */
  async predictRover(state) {
    const center = state.getUncompletedCenter();
    const avgBattery = state.getAverageBattery();
    const remainRatio = state.getUncompletedOrders().length / 8.0;

    const observation = [
      state.rover.x,
      state.rover.y,
      center.x - state.rover.x,
      center.y - state.rover.y,
      remainRatio,
      avgBattery
    ];

    return await this.predict(this.sessions.rover, observation, [1, 6]);
  }

  /**
   * 无人机决策推理
   * @param {Object} uav - 无人机状态
   * @param {Object} state - 仿真状态
   * @param {number} index - 无人机索引 (0, 1, 2)
   * @returns {Float32Array} [dx, dy, dz]
   */
  async predictUAV(uav, state, index) {
    const nearest = pickupPose(state.getNearestOrder(uav));

    const observation = [
      uav.x,
      uav.y,
      uav.z,
      uav.battery,
      state.rover.x - uav.x,
      state.rover.y - uav.y,
      0.0 - uav.z,
      nearest.x - uav.x,
      nearest.y - uav.y,
      nearest.z - uav.z
    ];

    const sessionKey = `uav${index + 1}`;
    return await this.predict(this.sessions[sessionKey], observation, [1, 10]);
  }

  /**
   * 执行完整的一步仿真
   * @param {SimulationState} state - 仿真状态
   */
  async step(state, { deltaSeconds = 0.52, visualUAVs, requireVisual = false } = {}) {
    if (!this.isLoaded) {
      throw new Error('模型尚未加载');
    }

    // 1. 母车推理
    // 每步位移除以4：约0.75米/步（tick约0.5s），贴近真实无人车速度
    const roverAction = await this.predictRover(state);
    // Park before docking, so interpolation can settle at the same physical
    // point. A perpetually moving deck cannot satisfy a strict hover gate.
    const docking = state.uavs.some((uav) => uav.phase === 'unloading' || (uav.phase === 'returning' && distanceMeters(uav, returnPose(state.rover, uav)) <= 6));
    if (!docking) {
      state.rover.x = Math.max(0, Math.min(1, state.rover.x + roverAction[0] * 0.0075 * deltaSeconds / 0.52));
      state.rover.y = Math.max(0, Math.min(1, state.rover.y + roverAction[1] * 0.0075 * deltaSeconds / 0.52));
    }
    state.assignOrders();

    // 2. 无人机推理
    const completedOrders = [];
    const chargingUAVs = [];

    for (let i = 0; i < state.uavs.length; i++) {
      const uav = state.uavs[i];
      const visual = visualUAVs?.[uav.id];
      const uavAction = uav.phase === 'cruising' ? await this.predictUAV(uav, state, i) : [0, 0, 0];
      state.advanceUAV(uav, uavAction, deltaSeconds);
      state.advanceReturn(uav, deltaSeconds, visual, requireVisual);
      if (uav.phase === 'idle' && uav.unloadElapsed > 0) moveTowards(uav, returnPose(state.rover, uav), deltaSeconds, 5);

      // 消耗电量（随速度同步放慢，保持任务时长与电量的相对关系）
      if (uav.phase !== 'idle') uav.battery = Math.max(0, uav.battery - 0.003 * deltaSeconds / 0.52);

      // 检查充电
      if (state.checkCharging(uav)) {
        chargingUAVs.push(uav.id);
      }

      // 检查订单完成
      const completedOrderId = state.checkOrderCompletion(uav, { deltaSeconds, visual, requireVisual });
      if (completedOrderId) {
        completedOrders.push({ uavId: uav.id, orderId: completedOrderId });
      }
    }

    // 更新统计
    state.updateDistances();
    state.incrementStep();

    return {
      completedOrders,
      chargingUAVs
    };
  }
}
