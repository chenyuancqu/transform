import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationState } from '../src/core/SimulationState.js';
import { PICKUP_RULES, WORLD_UNITS, missionToWorld, pickupPose } from '../src/core/MissionRules.js';
import { AIEngine } from '../src/core/AIEngine.js';
import pickupLocations from '../src/core/campusPickupLocations.json' with { type: 'json' };
import { CAMPUS_BUILDINGS, OFFICE_DIMENSIONS } from '../src/rendering/campusScenePlan.js';

test('shared balcony parcel coordinates sit on their rendered floors and courtyard orders stay low', () => {
  const state = new SimulationState();
  const balconies = state.orders.filter((order) => order.pickupType === 'balcony');
  assert.equal(balconies.length, 6);
  assert.equal(state.orders.filter((order) => order.pickupType === 'courtyard').length, 2);
  for (const order of balconies) {
    const location = pickupLocations.find((item) => item.id === order.id);
    const building = CAMPUS_BUILDINGS.find((item) => item.id === order.buildingId);
    const [, scaleY, scaleZ] = building.visualScale;
    const localFront = OFFICE_DIMENSIONS.front - 0.12 + 2.3;
    const yaw = building.yaw;
    const expectedX = building.position[0] + Math.sin(yaw) * localFront * scaleZ;
    const expectedZ = building.position[2] + Math.cos(yaw) * localFront * scaleZ;
    const expectedPackageY = (32 * order.floor / 11) * scaleY + 0.25;
    assert.ok(Math.abs(location.position[0] - expectedX) < 0.02, `order ${order.id} aligns with its balcony depth`);
    assert.ok(Math.abs(location.position[2] - expectedZ) < 0.02, `order ${order.id} aligns with its balcony width`);
    assert.ok(Math.abs(location.position[1] - expectedPackageY) < 0.02, `order ${order.id} rests on floor ${order.floor}`);
    assert.ok(Math.abs(order.x * 200 - 100 - location.position[0]) < 1e-8);
    assert.ok(Math.abs(order.y * 200 - 100 - location.position[2]) < 1e-8);
    assert.ok(Math.abs(order.z * 50 - location.position[1]) < 1e-8);
  }
});

function alignedMission() {
  const state = new SimulationState();
  state.assignOrders();
  const uav = state.uavs[0];
  const order = state.orders.find((item) => item.id === uav.targetOrderId);
  Object.assign(uav, pickupPose(order));
  const visual = { position: missionToWorld(uav), pickupOrderId: order.id, pickupProgress: 0 };
  const tick = (seconds = 0.52) => state.checkOrderCompletion(uav, { deltaSeconds: seconds, visual, requireVisual: true });
  return { state, uav, order, visual, tick };
}

test('16m away cannot complete; height uses 50m rather than horizontal 200m scale', () => {
  const { state, uav, order, tick } = alignedMission();
  uav.x += 16 / WORLD_UNITS.coordScale;
  for (let i = 0; i < 10; i++) assert.equal(tick(), null);
  assert.equal(uav.stableElapsed, 0);
  Object.assign(uav, pickupPose(order));
  uav.z += 0.3 / WORLD_UNITS.heightScale;
  for (let i = 0; i < 10; i++) assert.equal(tick(), null);
  assert.equal(state.stats.completedOrders, 0);
  assert.equal(order.completed, false);
});

test('diagonal error and rendered position must both be within docking limits', () => {
  const { uav, order, visual, tick } = alignedMission();
  uav.x += 0.3 / WORLD_UNITS.coordScale;
  uav.y += 0.3 / WORLD_UNITS.coordScale;
  assert.equal(tick(2), null);
  assert.equal(uav.stableElapsed, 0);
  Object.assign(uav, pickupPose(order));
  visual.position.x += 1;
  assert.equal(tick(2), null);
  assert.equal(uav.phase, 'cruising');
  assert.equal(uav.stableElapsed, 0);
});

test('hover must be continuous and loading animation must finish before completion', () => {
  const { state, uav, order, visual, tick } = alignedMission();
  tick(0.5);
  visual.position.z += 0.6;
  tick(0.4);
  assert.equal(uav.stableElapsed, 0);
  visual.position = missionToWorld(uav);
  tick(0.5);
  assert.equal(uav.phase, 'aligning');
  tick(0.4);
  assert.equal(uav.phase, 'picking');
  tick(PICKUP_RULES.animationSeconds - 0.1);
  assert.equal(order.completed, false);
  tick(0.2);
  assert.equal(order.completed, false, 'business clock cannot finish a lagging visual animation');
  visual.pickupProgress = 1;
  assert.equal(tick(), order.id);
  assert.equal(state.stats.completedOrders, 1);
  assert.equal(uav.phase, 'returning');
  assert.equal(uav.cargoOrderId, order.id);
  assert.equal(tick(), null, 'cannot count the same parcel twice');
});

test('flying through the tolerance zone does not qualify as a stable hover', () => {
  const { state, uav, visual, tick } = alignedMission();
  visual.speed = 1;
  assert.equal(tick(2), null);
  assert.equal(uav.stableElapsed, 0);
  assert.equal(state.stats.completedOrders, 0);
});

test('assignments are exclusive and reset clears reservations, phases and cargo', () => {
  const { state, uav, tick, visual } = alignedMission();
  assert.equal(new Set(state.uavs.map((item) => item.targetOrderId)).size, 3);
  for (let i = 0; i < 2; i++) tick();
  visual.pickupProgress = 1;
  for (let i = 0; i < 7; i++) tick();
  state.assignOrders();
  assert.equal(uav.targetOrderId, null, 'must unload before accepting another parcel');
  state.reset();
  assert.equal(state.stats.completedOrders, 0);
  assert.ok(state.orders.every((item) => !item.completed && item.reservedBy == null));
  assert.ok(state.uavs.every((item) => item.cargoOrderId == null && item.phase === 'idle'));
});

test('deterministic mission finishes all 8 pickups and returns all cargo to the rover', async () => {
  const state = new SimulationState();
  const engine = new AIEngine();
  engine.isLoaded = true;
  engine.predictRover = async () => [0, 0];
  // ONNX is not invoked here: exercise orchestration and docking independently.
  engine.predictUAV = async (uav) => {
    const target = pickupPose(state.getNearestOrder(uav));
    const dx = target.x - uav.x; const dy = target.y - uav.y;
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length, Math.sign(target.z - uav.z)];
  };
  const collected = [];
  for (let i = 0; i < 600; i++) {
    const result = await engine.step(state);
    collected.push(...result.completedOrders.map((item) => item.orderId));
    if (state.stats.completedOrders === 8 && state.uavs.every((item) => item.cargoOrderId == null)) break;
  }
  assert.equal(collected.length, 8);
  assert.equal(new Set(collected).size, 8);
  assert.ok(state.orders.every((item) => item.completed));
  assert.equal(state.stats.deliveredOrders, 8);
  assert.ok(state.uavs.every((item) => item.phase === 'idle' && item.cargoOrderId == null));
  assert.ok(state.stats.uavDistanceMeters > 0);
});

test('a stalling or wrong-way cruise policy cannot leave an assigned pickup unreachable', () => {
  for (const action of [[0, 0, 0], [1, -1, 0]]) {
    const { state, uav, order } = alignedMission();
    uav.x = 0.5; uav.y = 0.5; uav.z = 0.05;
    for (let i = 0; i < 150 && !order.completed; i++) {
      state.advanceUAV(uav, action, 0.52);
      state.checkOrderCompletion(uav, { deltaSeconds: 0.52 });
    }
    assert.equal(order.completed, true);
    assert.equal(state.stats.completedOrders, 1);
  }
});

test('a moving rover parks during docking so returning cargo can actually unload', async () => {
  const { state, uav, order } = alignedMission();
  state.uavs = [uav];
  order.completed = true;
  order.status = 'collected';
  state.stats.completedOrders = 1;
  Object.assign(uav, { x: state.rover.x, y: state.rover.y, z: 2.35 / WORLD_UNITS.heightScale, phase: 'returning', cargoOrderId: order.id, targetOrderId: null });
  const engine = new AIEngine();
  engine.isLoaded = true;
  engine.predictRover = async () => [1, 1];
  engine.predictUAV = async () => [0, 0, 0];
  const parked = { x: state.rover.x, y: state.rover.y };
  for (let i = 0; i < 10 && state.stats.deliveredOrders === 0; i++) {
    await engine.step(state);
    assert.equal(state.rover.x, parked.x);
    assert.equal(state.rover.y, parked.y);
  }
  assert.equal(state.stats.deliveredOrders, 1);
  assert.equal(uav.cargoOrderId, null);
});
