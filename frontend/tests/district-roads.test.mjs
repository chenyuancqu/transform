import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DISTRICT_LAYOUT} from '../src/rendering/districtScenePlan.js';

function overlapArea(a,b){
  const width=Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2);
  const depth=Math.min(a.z+a.d/2,b.z+b.d/2)-Math.max(a.z-a.d/2,b.z-b.d/2);
  return width>1e-5&&depth>1e-5?width*depth:0;
}

test('district road junctions do not contain overlapping coplanar road faces',()=>{
  for(let i=0;i<DISTRICT_LAYOUT.roads.length;i++)for(let j=i+1;j<DISTRICT_LAYOUT.roads.length;j++){
    const a=DISTRICT_LAYOUT.roads[i],b=DISTRICT_LAYOUT.roads[j];
    if(a.y===b.y)assert.equal(overlapArea(a,b),0,`roads ${i} and ${j} overlap at y=${a.y}`);
  }
});

test('district sidewalk corners do not contain overlapping coplanar paving faces',()=>{
  for(let i=0;i<DISTRICT_LAYOUT.sidewalks.length;i++)for(let j=i+1;j<DISTRICT_LAYOUT.sidewalks.length;j++){
    const a=DISTRICT_LAYOUT.sidewalks[i],b=DISTRICT_LAYOUT.sidewalks[j];
    if(a.y===b.y)assert.equal(overlapArea(a,b),0,`sidewalks ${i} and ${j} overlap at y=${a.y}`);
  }
});
