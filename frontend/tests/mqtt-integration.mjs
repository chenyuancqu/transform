import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://127.0.0.1:1883', { reconnectPeriod: 0, clientId: `campus_integration_${Date.now()}` });
let snapshot;
const replies = new Map();
let actionCount = 0;
const telemetry = new Map();
const completions = [];
let previousCompleted = 0;
let maxConcurrentUnloads=0,queueObserved=false;
const waitFor = async (predicate, timeout = 5000) => {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('MQTT test timed out'); await new Promise(r => setTimeout(r, 50)); }
};
client.on('message', (topic, payload) => {
  const data = JSON.parse(payload.toString());
  if (topic === 'simulation/snapshot') {
    snapshot = data;
    const unloading=data.uavs.filter(u=>u.phase==='unloading');maxConcurrentUnloads=Math.max(maxConcurrentUnloads,unloading.length);
    queueObserved ||= data.uavs.some(u=>u.phase==='waitingDock');
    if(unloading.length){assert.equal(unloading.length,1);assert.equal(unloading[0].id,data.docking.owner);assert.equal(data.docking.hatchProgress,1);}
    if (data.stats.completedOrders > previousCompleted) completions.push({ elapsed: data.elapsedSeconds, count: data.stats.completedOrders });
    previousCompleted = data.stats.completedOrders;
  } else if (topic.startsWith('simulation/action/')) { assert.equal(data.length, 1); assert.ok(data[0].every(Number.isFinite)); actionCount++; }
  else if (topic.startsWith('simulation/state/')) telemetry.set(data.id, data);
  else if (data.request_id) replies.set(data.request_id, data);
});
await new Promise((resolve, reject) => { client.on('connect', resolve); client.on('error', reject); });
await new Promise((resolve, reject) => client.subscribe(['simulation/snapshot', 'simulation/command/result', 'simulation/agent/status', 'simulation/action/#', 'simulation/state/#'], { qos: 1 }, error => error ? reject(error) : resolve()));
const send = async (topic, data, request_id = crypto.randomUUID()) => {
  replies.delete(request_id);
  client.publish(topic, JSON.stringify({ ...data, request_id }), { qos: 1 });
  await waitFor(() => replies.has(request_id));
  return replies.get(request_id);
};
const control = async data => { const result = await send('simulation/control', data); assert.equal(result.ok, true, result.message); await new Promise(r => setTimeout(r, 180)); return result; };
try {
  await waitFor(() => snapshot?.health.online);
  const resetId = crypto.randomUUID();
  const first = await send('simulation/control', { action: 'reset' }, resetId);
  await waitFor(() => snapshot.epoch === first.epoch);
  const again = await send('simulation/control', { action: 'reset' }, resetId);
  assert.equal(again.epoch, first.epoch, 'QoS replay must not reset twice');
  const bOrderCount = snapshot.orders.filter(order => order.area === 'B').length;
  assert.ok(bOrderCount >= 2, 'random missions keep at least two B-area orders for the two-agent preset');
  assert.equal((await send('simulation/control', { action: 'speed', value: 9 })).ok, false);
  if (!snapshot.health.agentConfigured) {
    const result = await send('simulation/command/input', { text: '派1号到B区取件' });
    assert.equal(result.status, 'error');
    assert.match(result.message, /未配置 AI 接口/);
  }
  const bMissionInitialCount = snapshot.orders.length;
  const b = await send('simulation/command/agent', { action_type: 'dispatch', target_area: 'B', priority: 'urgent', assign_agents: ['uav_1', 'uav_3'], energy_limit: null });
  assert.equal(b.ok, true);
  await waitFor(() => snapshot.uavs[0].targetOrderId && snapshot.uavs[2].targetOrderId);
  assert.equal(snapshot.uavs[1].targetOrderId, null);
  for (const u of [snapshot.uavs[0], snapshot.uavs[2]]) assert.equal(snapshot.orders.find(o => o.id === u.targetOrderId).area, 'B');
  await control({ action: 'speed', value: 2 });
  await waitFor(() => snapshot.orders.length > bMissionInitialCount, 45000);
  assert.equal(snapshot.orders.find(order => order.id === bMissionInitialCount + 1).area, 'B',
    'a B-area mission must replenish only B-area pickup anchors');
  const stop = await send('simulation/command/agent', { action_type: 'emergency_stop', assign_agents: ['all'] });
  assert.equal(stop.ok, true);
  await waitFor(() => !snapshot.running);
  const frozen = JSON.stringify({ rover: snapshot.rover, uavs: snapshot.uavs, stats: snapshot.stats, elapsed: snapshot.elapsedSeconds });
  await new Promise(r => setTimeout(r, 450));
  assert.equal(JSON.stringify({ rover: snapshot.rover, uavs: snapshot.uavs, stats: snapshot.stats, elapsed: snapshot.elapsedSeconds }), frozen);
  await control({ action: 'reset' });
  const initialOrderCount = snapshot.orders.length;
  assert.ok(initialOrderCount >= 4 && initialOrderCount <= 8);
  await control({ action: 'speed', value: 2 });
  await control({ action: 'start' });
  await waitFor(() => snapshot.elapsedSeconds > 1);
  await control({ action: 'pause' });
  const pauseTime = snapshot.elapsedSeconds;
  await new Promise(r => setTimeout(r, 300));
  assert.equal(snapshot.elapsedSeconds, pauseTime);
  await control({ action: 'start' });
  console.log('MQTT controls, duplicate protection, B-area dispatch, pause, emergency stop and resume passed. Waiting for a new order during the running mission…');
  await waitFor(() => snapshot.orders.length > initialOrderCount, 30000);
  const streamedOrder = snapshot.orders.find(order => order.id === initialOrderCount + 1);
  assert.ok(streamedOrder);
  assert.ok(streamedOrder.createdAt > 0, 'streamed order was created after the mission started');
  assert.equal(snapshot.stats.totalOrders, snapshot.orders.length);
  assert.ok(snapshot.stats.completionRate >= 0 && snapshot.stats.completionRate <= 100);
  assert.ok(snapshot.orders.every(order => order.id >= 1 && order.id <= snapshot.orders.length));
  const countAtPause = snapshot.orders.length;
  await control({ action: 'pause' });
  const elapsedAtPause = snapshot.elapsedSeconds;
  await new Promise(r => setTimeout(r, 350));
  assert.equal(snapshot.orders.length, countAtPause, 'paused simulation must freeze order arrivals');
  assert.equal(snapshot.elapsedSeconds, elapsedAtPause, 'paused simulation clock must stay frozen');
  const emergency = await send('simulation/command/agent', { action_type: 'emergency_stop', assign_agents: ['all'] });
  assert.equal(emergency.ok, true);
  await waitFor(() => !snapshot.running);
  assert.ok(maxConcurrentUnloads <= 1);
  assert.ok(actionCount > 4);
  assert.equal(telemetry.size, 4);
  assert.equal(telemetry.get('mother').coordinate_system, 'campus_meters_xy_height');
  const report = { success: true, checked: ['updated ONNX actions', 'four-agent metre telemetry', 'request deduplication', 'B-area selected agents', 'emergency_stop', 'pause/resume', 'runtime order spawning and pause freeze'],
    timestamp: new Date().toISOString(), initialOrderCount, finalOrderCount: snapshot.orders.length,
    actionsReceived: actionCount, maxConcurrentUnloads, queueObserved, completions, snapshot };
  await mkdir('output/backend', { recursive: true });
  await writeFile('output/backend/mqtt-integration.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: true, initialOrders: initialOrderCount, finalOrders: snapshot.orders.length,
    completed: snapshot.stats.completedOrders, delivered: snapshot.stats.deliveredOrders,
    elapsed: snapshot.elapsedSeconds, actionCount, inferenceMs: snapshot.health.inferenceMs }));
} finally { client.end(true); }
