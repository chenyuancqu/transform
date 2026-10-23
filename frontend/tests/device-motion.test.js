import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Scene,Group} from 'three';
import {synchronizeVisualPosition,findAttachedObject} from '../src/rendering/DeviceMotion.js';
test('paused docking corrects display lag once, holds the authoritative pose, and resumes with smooth motion',()=>{
  const position=new Vector3(-25.6,2.63,30.17),dock=new Vector3(-26.7188,2.63,30);
  synchronizeVisualPosition(position,dock,.016,false);assert.deepEqual(position.toArray(),dock.toArray());
  synchronizeVisualPosition(position,dock,1,false);assert.deepEqual(position.toArray(),dock.toArray());
  const next=new Vector3(-28,3,30);synchronizeVisualPosition(position,next,.016,true);assert.ok(position.x<dock.x&&position.x>next.x);assert.ok(position.y>dock.y&&position.y<next.y);
});

test('device labels resolve the live object after an epoch or Suspense remount',()=>{
  const scene=new Scene(),oldRoot=new Group(),oldDevice=new Group(),cache=new Map();
  oldDevice.name='device-rover';oldRoot.add(oldDevice);scene.add(oldRoot);
  assert.equal(findAttachedObject(scene,cache,'device-rover'),oldDevice);
  scene.remove(oldRoot);
  const newDevice=new Group();newDevice.name='device-rover';newDevice.position.set(30,0,-30);scene.add(newDevice);
  assert.equal(findAttachedObject(scene,cache,'device-rover'),newDevice);
  scene.remove(newDevice);
  assert.equal(findAttachedObject(scene,cache,'device-rover'),undefined);
});
