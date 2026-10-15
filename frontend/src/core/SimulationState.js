/**
 * 仿真状态管理
 * 管理母车、无人机、订单的所有状态数据
 */

import { PICKUP_RULES, WORLD_UNITS, distanceMeters, isAtPickup, missionToWorld, moveTowards, pickupPose, returnPose } from './MissionRules.js';
import pickupLocations from './campusPickupLocations.json' with { type: 'json' };

export class SimulationState {
  constructor() {
    this.reset();
  }

  reset() {
    // 母车初始状态
    this.rover = {
      x: 0.5,
      y: 0.5,
      prevX: 0.5,
      prevY: 0.5
    };

    // 3架无人机初始状态
    this.uavs = [
      { id: 1, x: 0.5, y: 0.5, z: 0.05, battery: 1.0, prevX: 0.5, prevY: 0.5, prevZ: 0.05, wasCharging: false },
      { id: 2, x: 0.55, y: 0.5, z: 0.05, battery: 1.0, prevX: 0.55, prevY: 0.5, prevZ: 0.05, wasCharging: false },
      { id: 3, x: 0.45, y: 0.5, z: 0.05, battery: 1.0, prevX: 0.45, prevY: 0.5, prevZ: 0.05, wasCharging: false }
    ];
    this.uavs.forEach((uav) => Object.assign(uav, { phase: 'idle', targetOrderId: null, cargoOrderId: null, stableElapsed: 0, pickupElapsed: 0, unloadElapsed: 0 }));

    // Six parcels live on real balcony decks; two remain in the courtyard.
    // The shared metre positions also configure the authoritative MEC mission.
    this.orders = pickupLocations.map(({ id, pickupType, buildingId, floor, position }) => ({
      id, x: (position[0] + 100) / WORLD_UNITS.coordScale,
      y: (position[2] + 100) / WORLD_UNITS.coordScale,
      z: position[1] / WORLD_UNITS.heightScale,
      pickupType, buildingId, floor, completed: false, reservedBy: null, status: 'waiting'
    }));

    // 统计数据
    this.stats = {
      stepCount: 0,
      completedOrders: 0,
      deliveredOrders: 0,
      totalCharges: 0,
      roverTotalDistance: 0,
      uavTotalDistance: 0,
      uavDistanceMeters: 0,
      roverDistanceMeters: 0,
      chargeEvents: [] // 记录充电事件时间
    };
  }

  // 获取未完成订单列表
  getUncompletedOrders() {
    return this.orders.filter(order => !order.completed);
  }

  // 计算未完成订单的几何中心
  getUncompletedCenter() {
    const uncompleted = this.getUncompletedOrders();
    if (uncompleted.length === 0) {
      return { x: 0.5, y: 0.5 };
    }

    const sum = uncompleted.reduce(
      (acc, order) => ({ x: acc.x + order.x, y: acc.y + order.y }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / uncompleted.length,
      y: sum.y / uncompleted.length
    };
  }

  // 获取距离某无人机最近的未完成订单
  getNearestOrder(uav) {
    const assigned = this.orders.find((order) => order.id === uav.targetOrderId && !order.completed);
    if (assigned) return assigned;
    const uncompleted = this.getUncompletedOrders().filter((order) => order.reservedBy == null || order.reservedBy === uav.id);
    if (uncompleted.length === 0) {
      return { x: 0.5, y: 0.5, z: 0.1 };
    }

    let nearest = uncompleted[0];
    let minDist = Infinity;

    for (const order of uncompleted) {
      const dist = distanceMeters(uav, pickupPose(order));
      if (dist < minDist) {
        minDist = dist;
        nearest = order;
      }
    }

    return nearest;
  }

  assignOrders() {
    for (const uav of this.uavs) {
      if (uav.cargoOrderId != null || uav.targetOrderId != null) continue;
      const available = this.getUncompletedOrders().filter((order) => order.reservedBy == null);
      available.sort((a, b) => distanceMeters(uav, pickupPose(a)) - distanceMeters(uav, pickupPose(b)));
      if (!available.length) { uav.phase = 'idle'; continue; }
      const order = available[0];
      order.reservedBy = uav.id;
      order.status = 'enroute';
      uav.targetOrderId = order.id;
      uav.phase = 'cruising';
    }
  }

  advanceUAV(uav, action, deltaSeconds) {
    if (['picking', 'aligning', 'returning', 'unloading', 'idle'].includes(uav.phase)) return;
    const order = this.orders.find((item) => item.id === uav.targetOrderId);
    if (!order || order.completed) return;
    const destination = pickupPose(order);
    const distance = distanceMeters(uav, destination);
    if (uav.phase === 'approaching' || distance <= PICKUP_RULES.approachRadius) {
      uav.phase = 'approaching';
      order.status = uav.phase === 'cruising' ? 'enroute' : 'approaching';
      moveTowards(uav, destination, deltaSeconds, Math.min(PICKUP_RULES.approachSpeed, Math.max(0.25, distance * 0.9)));
    } else {
      // Preserve the existing slow cruise increments, scaled to simulation time.
      const factor = 0.015 * deltaSeconds / 0.52;
      const candidate = {
        x: Math.max(0, Math.min(1, uav.x + action[0] * factor)),
        y: Math.max(0, Math.min(1, uav.y + action[1] * factor)),
        z: Math.max(2.5 / WORLD_UNITS.heightScale, Math.min(6 / WORLD_UNITS.heightScale, uav.z + action[2] * factor))
      };
      // A learned policy trained with the old 16m arrival zone can stall or
      // point away after a return trip. Reject non-progressing commands and
      // guide to the reserved goal, instead of relaxing the arrival threshold.
      if (distance - distanceMeters(candidate, destination) >= 0.05 * deltaSeconds) {
        Object.assign(uav, candidate);
      } else {
        moveTowards(uav, { ...destination, z: Math.max(destination.z, 2.5 / WORLD_UNITS.heightScale) }, deltaSeconds, 5);
      }
    }
  }

  // Arrival is a stable hover of the actual drone centre above the parcel.
  // Completion additionally waits for the renderer to finish lifting the parcel.
  checkOrderCompletion(uav, { deltaSeconds = 0, visual, requireVisual = false } = {}) {
    const order = this.orders.find((item) => item.id === uav.targetOrderId && !item.completed && item.reservedBy === uav.id);
    if (!order) return null;
    const aligned = isAtPickup(missionToWorld(uav), order)
      && (!requireVisual || (isAtPickup(visual?.position, order) && (visual.speed ?? 0) <= PICKUP_RULES.maxHoverSpeed));
    if (!aligned) {
      uav.stableElapsed = 0;
      uav.pickupElapsed = 0;
      if (uav.phase === 'aligning' || uav.phase === 'picking') uav.phase = 'approaching';
      order.status = uav.phase === 'cruising' ? 'enroute' : 'approaching';
      return null;
    }
    if (uav.phase !== 'picking') {
      uav.phase = 'aligning';
      order.status = 'aligning';
      uav.stableElapsed += deltaSeconds;
      if (uav.stableElapsed >= PICKUP_RULES.stableSeconds) {
        uav.phase = 'picking';
        order.status = 'picking';
        uav.pickupElapsed = 0;
      }
      return null;
    }
    uav.pickupElapsed += deltaSeconds;
    const animationFinished = !requireVisual || (visual?.pickupOrderId === order.id && visual.pickupProgress >= 1);
    if (uav.pickupElapsed < PICKUP_RULES.animationSeconds || !animationFinished) return null;
    order.completed = true;
    order.status = 'collected';
    this.stats.completedOrders++;
    uav.cargoOrderId = order.id;
    uav.targetOrderId = null;
    uav.phase = 'returning';
    uav.unloadElapsed = 0;
    return order.id;
  }

  advanceReturn(uav, deltaSeconds, visual, requireVisual = false) {
    if (!['returning', 'unloading'].includes(uav.phase)) return;
    const destination = returnPose(this.rover, uav);
    if (uav.phase === 'returning') {
      moveTowards(uav, destination, deltaSeconds, PICKUP_RULES.returnSpeed);
      const world = missionToWorld(destination);
      const visibleNear = !requireVisual || (visual?.position && Math.hypot(visual.position.x - world.x, visual.position.z - world.z) <= 0.5 && Math.abs(visual.position.y - world.y) <= 0.25);
      if (distanceMeters(uav, destination) <= 0.4 && visibleNear) { uav.phase = 'unloading'; uav.unloadElapsed = 0; }
    } else {
      Object.assign(uav, destination);
      uav.unloadElapsed += deltaSeconds;
      if (uav.unloadElapsed >= PICKUP_RULES.unloadSeconds && (!requireVisual || (visual?.cargoOrderId === uav.cargoOrderId && visual.unloadProgress >= 1))) {
        const delivered = this.orders.find((order) => order.id === uav.cargoOrderId);
        if (delivered && delivered.status !== 'delivered') {
          delivered.status = 'delivered';
          this.stats.deliveredOrders++;
        }
        uav.cargoOrderId = null;
        uav.phase = 'idle';
        uav.stableElapsed = 0;
        uav.pickupElapsed = 0;
      }
    }
  }

  // 检查充电逻辑
  checkCharging(uav) {
    const distToRover = Math.hypot(uav.x - this.rover.x, uav.y - this.rover.y) * WORLD_UNITS.coordScale;

    if (distToRover <= 1.4 && uav.z * WORLD_UNITS.heightScale <= 2.5) {
      if (!uav.wasCharging && uav.battery < 1.0) {
        this.stats.totalCharges++;
        this.stats.chargeEvents.push(this.stats.stepCount);
      }
      uav.battery = 1.0;
      uav.wasCharging = true;
      return true;
    } else {
      uav.wasCharging = false;
      return false;
    }
  }

  // 更新统计距离
  updateDistances() {
    // 母车移动距离
    const roverDist = Math.sqrt(
      Math.pow(this.rover.x - this.rover.prevX, 2) +
      Math.pow(this.rover.y - this.rover.prevY, 2)
    );
    this.stats.roverTotalDistance += roverDist;
    this.stats.roverDistanceMeters += roverDist * WORLD_UNITS.coordScale;
    this.rover.prevX = this.rover.x;
    this.rover.prevY = this.rover.y;

    // 无人机飞行距离
    for (const uav of this.uavs) {
      const uavDist = Math.sqrt(
        Math.pow(uav.x - uav.prevX, 2) +
        Math.pow(uav.y - uav.prevY, 2) +
        Math.pow(uav.z - uav.prevZ, 2)
      );
      this.stats.uavTotalDistance += uavDist;
      this.stats.uavDistanceMeters += distanceMeters(uav, { x: uav.prevX, y: uav.prevY, z: uav.prevZ });
      uav.prevX = uav.x;
      uav.prevY = uav.y;
      uav.prevZ = uav.z;
    }
  }

  // 获取平均电量
  getAverageBattery() {
    const sum = this.uavs.reduce((acc, uav) => acc + uav.battery, 0);
    return sum / this.uavs.length;
  }

  // 获取任务完成率
  getCompletionRate() {
    return (this.stats.completedOrders / this.orders.length) * 100;
  }

  // 增加步数
  incrementStep() {
    this.stats.stepCount++;
  }
}
