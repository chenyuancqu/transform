// Explicit opt-in: sends synthetic instructions to the configured paid AI API.
// Resets the local demo; normal test runs never call an external model.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import mqtt from 'mqtt';

if (!process.argv.includes('--live')) throw new Error('Pass --live to test the configured real AI API.');
const client = mqtt.connect('ws://127.0.0.1:8083/mqtt', {reconnectPeriod: 0});
let snapshot, failure;
const results = new Map(), statuses = new Map(), records = [];
const wait = async (predicate, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (failure) throw failure;
    if (Date.now() > end) throw new Error('AI live acceptance timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};
client.on('message', (topic, bytes) => {
  try {
    const data = JSON.parse(bytes.toString());
    if (topic === 'simulation/snapshot') snapshot = data;
    else if (topic === 'simulation/command/result') results.set(data.request_id, data);
    else statuses.set(data.request_id, data);
  } catch (error) { failure = error; }
});
const control = async data => {
  const id = crypto.randomUUID();
  client.publish('simulation/control', JSON.stringify({...data, epoch: snapshot.epoch, request_id: id}), {qos: 1});
  await wait(() => results.has(id));
  assert.equal(results.get(id).ok, true);
};
const chat = async text => {
  const id = crypto.randomUUID(), started = Date.now();
  client.publish('simulation/command/input', JSON.stringify({text, epoch: snapshot.epoch, request_id: id}), {qos: 1});
  await wait(() => results.has(id) || statuses.get(id)?.status === 'error', 35000);
  const receipt = results.get(id) ?? statuses.get(id);
  records.push({text, latencyMs: Date.now() - started, receipt});
  assert.equal(receipt.ok, true, receipt.message);
  return receipt;
};
try {
  await new Promise((resolve, reject) => {client.once('connect', resolve); client.once('error', reject);});
  await new Promise((resolve, reject) => client.subscribe([
    'simulation/snapshot', 'simulation/command/result', 'simulation/agent/status',
  ], {qos: 1}, error => error ? reject(error) : resolve()));
  await wait(() => snapshot?.health.agentReady);
  const epoch = snapshot.epoch;
  await control({action: 'reset'});
  await wait(() => snapshot.epoch !== epoch);
  await control({action: 'speed', value: 2});
  const first = await chat('派1号和3号无人机去B区取件，普通优先级，不设置能耗上限。');
  assert.equal(first.command.target_area, 'B');
  assert.deepEqual([...first.command.assign_agents].sort(), ['uav_1', 'uav_3']);
  await wait(() => snapshot.running && snapshot.dispatch?.assignments?.length > 0);
  assert.ok(snapshot.dispatch.assignments.every(a => [1, 3].includes(a.uavId)));
  assert.ok(snapshot.dispatch.assignments.every(a => snapshot.orders.find(o => o.id === a.orderId).area === 'B'));
  const wave = snapshot.dispatch.wave;
  const assignments = JSON.stringify(snapshot.dispatch.assignments);
  const second = await chat('切换为节能调度，全园区，所有无人机，单机能耗预算75%。');
  assert.equal(second.command.action_type, 'optimize_energy');
  assert.equal(second.command.energy_limit, 75);
  await wait(() => snapshot.dispatch.pendingCommand);
  assert.equal(snapshot.dispatch.wave, wave);
  assert.equal(JSON.stringify(snapshot.dispatch.assignments), assignments, 'AI must preserve the current wave');
  await wait(() => snapshot.dispatch.wave > wave && !snapshot.dispatch.pendingCommand, 120000);
  assert.ok(snapshot.uavs.every(u => u.energyLimit === 75 && u.enabled));
  assert.equal(snapshot.dispatch.orderStream.intervalSeconds, 12);
  assert.equal(snapshot.dispatch.orderStream.maxOrders, 30);
  await chat('立即紧急停止所有设备。');
  await wait(() => !snapshot.running);
  const stoppedAt = snapshot.elapsedSeconds;
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(snapshot.elapsedSeconds, stoppedAt);
  assert.equal(snapshot.health.agentVerified, true);
  await mkdir('output/v2-integration', {recursive: true});
  await writeFile('output/v2-integration/ai-live-acceptance.json', JSON.stringify({
    ok: true, model: snapshot.health.agentModel,
    checks: ['real-model-chat', 'region-and-device-execution', 'preserve-inflight-wave',
      'apply-energy-budget-next-wave', 'dynamic-order-config', 'natural-language-emergency-stop'], records,
  }, null, 2));
  console.log('Real AI dispatch, next-wave budget and emergency stop passed.');
} finally { client.end(true); }
