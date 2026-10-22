import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSnapshot, interpolateSnapshots, isNewSnapshot } from '../src/services/useCampusBackend.js';

const wire = () => ({ schema_version: 1, epoch: 'mission-a', seq: 1, timestamp: 1000,
  coordinate_system: 'campus_meters_xy_height', running: true, speed: .7,
  rover: { position: [0, 0, 0] },
  uavs: [3, 1, 2].map(id => ({ id, position: [20, -40, 2.5], battery: .85, phase: 'picking', pickupProgress: .3, unloadProgress: 0 })),
  orders: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, position: [0, 0, .6], completed: false })),
  stats: {}, health: { online: true }, events: [] });

test('metres explicitly adapt to the scene axes, agent order stays stable', () => {
  const data = decodeSnapshot(wire());
  assert.deepEqual(data.uavs.map(u => u.id), [1, 2, 3]);
  assert.equal(data.uavs[0].x, .6);
  assert.equal(data.uavs[0].y, .3);
  assert.equal(data.uavs[0].z, .05);
});
test('variable order counts are accepted while empty, duplicate, and oversized missions are rejected', () => {
  for (const count of [4, 8, 30]) {
    const data = wire();
    data.orders = Array.from({ length: count }, (_, i) => ({ id: i + 1, position: [i, 0, .6], completed: false }));
    assert.equal(decodeSnapshot(data).orders.length, count);
  }
  for (const count of [0, 31]) {
    const data = wire();
    data.orders = Array.from({ length: count }, (_, i) => ({ id: i + 1, position: [0, 0, .6], completed: false }));
    assert.throws(() => decodeSnapshot(data));
  }
  const duplicate = wire(); duplicate.orders[1].id = duplicate.orders[0].id;
  assert.throws(() => decodeSnapshot(duplicate));
});
test('random observation vectors, wrong units, NaN and malformed progress are rejected', () => {
  for (const mutate of [d => { d.coordinate_system = 'normalized'; }, d => { d.uavs[0].position = [NaN, 0, 0]; },
    d => { d.uavs[0].pickupProgress = 1.1; }, d => { d.uavs[0].id = 1; }, d => { delete d.rover.position; }]) {
    const d = wire(); mutate(d); assert.throws(() => decodeSnapshot(d));
  }
  assert.throws(() => decodeSnapshot({ id: 'uav_1', state: new Array(10).fill(.2) }));
});
test('position and loading progress use the same delayed timeline, phases do not jump early', () => {
  const a = decodeSnapshot(wire());
  const raw = wire(); raw.seq = 2; raw.uavs.forEach(u => { u.position[0] = 40; u.pickupProgress = .7; });
  const b = decodeSnapshot(raw);
  const halfway = interpolateSnapshots(a, b, .5);
  assert.ok(Math.abs(halfway.uavs[0].x - .65) < 1e-10);
  assert.equal(halfway.uavs[0].pickupProgress, .5);
  b.uavs[0].phase = 'returning'; b.uavs[0].cargoOrderId = 1;
  const delayed = interpolateSnapshots(a, b, .99);
  assert.equal(delayed.uavs[0].phase, 'picking');
  assert.equal(delayed.uavs[0].cargoOrderId, undefined);
  assert.equal(interpolateSnapshots(a, b, 1).uavs[0].phase, 'returning');
});
test('reset epochs snap to the new initial state rather than animate across two missions', () => {
  const a = decodeSnapshot(wire()); const b = decodeSnapshot(wire()); b.epoch = 'mission-b';
  assert.equal(interpolateSnapshots(a, b, .5), b);
});
test('duplicate and delayed frames cannot resurrect a previous reset epoch', () => {
  const a = decodeSnapshot(wire());
  assert.equal(isNewSnapshot(a, a), false);
  assert.equal(isNewSnapshot({ ...a, seq: 0, timestamp: 1100 }, a), false);
  const current = { ...a, epoch: 'mission-b', timestamp: 2000 };
  assert.equal(isNewSnapshot(a, current), false);
  assert.equal(isNewSnapshot({ ...current, seq: 2, timestamp: 2100 }, current), true);
});

test('bay queue and landing phases validate, hatch and wrapped heading interpolate coherently', () => {
  const a=wire();a.rover.heading=Math.PI-.1;a.docking={owner:1,queue:[1,2],hatchProgress:.2};a.uavs[0].phase='waitingDock';a.uavs[1].phase='parking';
  const b=structuredClone(a);b.seq=2;b.rover.heading=-Math.PI+.1;b.docking.hatchProgress=.8;
  const half=interpolateSnapshots(decodeSnapshot(a),decodeSnapshot(b),.5);
  assert.ok(Math.abs(half.rover.heading-Math.PI)<1e-10);
  assert.ok(Math.abs(half.docking.hatchProgress-.5)<1e-10);
  for(const mutate of [d=>{d.docking.hatchProgress=NaN;},d=>{d.docking.queue=[1,1];},d=>{d.docking.owner=3;},d=>{d.rover.heading=Infinity;}]){const bad=structuredClone(a);mutate(bad);assert.throws(()=>decodeSnapshot(bad));}
});

test('carrier charging phases and initial battery mode survive telemetry validation', () => {
  const data=wire();data.batteryMode='imbalanced';
  data.uavs[0].phase='charging';data.uavs[1].phase='docked';data.uavs[2].phase='takingOff';
  const decoded=decodeSnapshot(data);
  assert.equal(decoded.batteryMode,'imbalanced');
  assert.deepEqual(decoded.uavs.map(u=>u.phase),['docked','takingOff','charging']);
  const bad=wire();bad.batteryMode='mystery';assert.throws(()=>decodeSnapshot(bad));
});
