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
  assert.equal((await send('simulation/control', { action: 'speed', value: 9 })).ok, false);
  if (!snapshot.health.agentConfigured) {
    const result = await send('simulation/command/input', { text: '派1号到B区取件' });
    assert.equal(result.status, 'error');
    assert.match(result.message, /未配置 AI 接口/);
  }
  const b = await send('simulation/command/agent', { action_type: 'dispatch', target_area: 'B', priority: 'urgent', assign_agents: ['uav_1', 'uav_3'], energy_limit: null });
  assert.equal(b.ok, true);
  await waitFor(() => snapshot.uavs[0].targetOrderId && snapshot.uavs[2].targetOrderId);
  assert.equal(snapshot.uavs[1].targetOrderId, null);
  for (const u of [snapshot.uavs[0], snapshot.uavs[2]]) assert.equal(snapshot.orders.find(o => o.id === u.targetOrderId).area, 'B');
  const stop = await send('simulation/command/agent', { action_type: 'emergency_stop', assign_agents: ['all'] });
  assert.equal(stop.ok, true);
  await waitFor(() => !snapshot.running);
  const frozen = JSON.stringify({ rover: snapshot.rover, uavs: snapshot.uavs, stats: snapshot.stats, elapsed: snapshot.elapsedSeconds });
  await new Promise(r => setTimeout(r, 450));
  assert.equal(JSON.stringify({ rover: snapshot.rover, uavs: snapshot.uavs, stats: snapshot.stats, elapsed: snapshot.elapsedSeconds }), frozen);
  await control({ action: 'reset' });
  await control({ action: 'speed', value: 2 });
  await control({ action: 'start' });
  await waitFor(() => snapshot.elapsedSeconds > 1);
  await control({ action: 'pause' });
  const pauseTime = snapshot.elapsedSeconds;
  await new Promise(r => setTimeout(r, 300));
  assert.equal(snapshot.elapsedSeconds, pauseTime);
  await control({ action: 'start' });
  console.log('MQTT controls, duplicate protection, B-area dispatch, pause, emergency stop and unconfigured AI checks passed. Running full 8-parcel mission…');
  await waitFor(() => snapshot.stats.deliveredOrders === 8 && !snapshot.running, 120000);
  assert.equal(snapshot.stats.completedOrders, 8);
  assert.equal(snapshot.running, false);
  assert.ok(snapshot.orders.every(o => o.status === 'delivered'));
  assert.ok(snapshot.uavs.every(u => u.cargoOrderId === null));
  assert.ok(snapshot.uavs.every(u=>u.phase==='idle'));assert.equal(snapshot.docking.hatchProgress,0);assert.equal(snapshot.docking.queue.length,0);assert.equal(maxConcurrentUnloads,1);assert.equal(queueObserved,true);
  assert.ok(actionCount > 4);
  assert.equal(telemetry.size, 4);
  assert.equal(telemetry.get('mother').coordinate_system, 'campus_meters_xy_height');
  const report = { success: true, checked: ['real ONNX actions', 'four-agent metre telemetry', 'request deduplication', 'B-area selected agents', 'emergency_stop', 'pause/resume', '8 pickup/return/unload cycles'],
    timestamp: new Date().toISOString(), actionsReceived: actionCount, maxConcurrentUnloads,queueObserved,completions, snapshot };
  await mkdir('output/backend', { recursive: true });
  await writeFile('output/backend/mqtt-integration.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: true, completed: snapshot.stats.completedOrders, delivered: snapshot.stats.deliveredOrders, elapsed: snapshot.elapsedSeconds, actionCount, inferenceMs: snapshot.health.inferenceMs }));
} finally { client.end(true); }
