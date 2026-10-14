import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {synchronizeVisualPosition} from '../src/rendering/DeviceMotion.js';
test('paused docking corrects display lag once, holds the authoritative pose, and resumes with smooth motion',()=>{
  const position=new Vector3(-25.6,2.63,30.17),dock=new Vector3(-26.7188,2.63,30);
  synchronizeVisualPosition(position,dock,.016,false);assert.deepEqual(position.toArray(),dock.toArray());
  synchronizeVisualPosition(position,dock,1,false);assert.deepEqual(position.toArray(),dock.toArray());
  const next=new Vector3(-28,3,30);synchronizeVisualPosition(position,next,.016,true);assert.ok(position.x<dock.x&&position.x>next.x);assert.ok(position.y>dock.y&&position.y<next.y);
});
