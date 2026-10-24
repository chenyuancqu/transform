import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import mqtt from 'mqtt';
import {decodeSnapshot} from '../src/services/useCampusBackend.js';

const client=mqtt.connect('ws://127.0.0.1:8083/mqtt',{reconnectPeriod:0,clientId:`v2_acceptance_${Date.now()}`});
let snapshot, failure;
const replies=new Map(), phases=new Set(),waves=new Set();
const wait=async(predicate,timeout=5000)=>{
  const end=Date.now()+timeout;
  while(!predicate()){
    if(failure)throw failure;
    if(Date.now()>end)throw new Error('V2 MQTT integration timed out');
    await new Promise(r=>setTimeout(r,50));
  }
};
client.on('message',(topic,payload)=>{
  try{
    const data=JSON.parse(payload.toString());
    if(topic==='simulation/snapshot'){
      snapshot=decodeSnapshot(data);
      snapshot.uavs.forEach(u=>phases.add(u.phase));
      if(snapshot.dispatch?.wave)waves.add(snapshot.dispatch.wave);
      assert.ok(snapshot.uavs.filter(u=>u.phase==='unloading').length<=1);
    }else replies.set(data.request_id,data);
  }catch(error){failure=error;}
});
const send=async(data,agent=false,requestId=crypto.randomUUID())=>{
  replies.delete(requestId);
  client.publish(agent?'simulation/command/agent':'simulation/control',JSON.stringify({epoch:snapshot.epoch,...data,request_id:requestId}),{qos:1});
  await wait(()=>replies.has(requestId));
  return replies.get(requestId);
};
try{
  await new Promise((resolve,reject)=>{client.on('connect',resolve);client.on('error',reject);});
  await new Promise((resolve,reject)=>client.subscribe(['simulation/snapshot','simulation/command/result'],{qos:1},e=>e?reject(e):resolve()));
  await wait(()=>snapshot?.health.online);
  assert.equal(snapshot.health.policyVersion,2);
  assert.equal(snapshot.health.modelsLoaded,1);
  const initialEpoch=snapshot.epoch;
  assert.equal((await send({action:'reset'})).ok,true);
  await wait(()=>snapshot.epoch!==initialEpoch&&snapshot.stats.stepCount===0);
  const initialCount=snapshot.orders.length;
  assert.ok(initialCount>=4&&initialCount<=8);
  assert.equal(snapshot.dispatch.fixedOrders,false);
  assert.equal(snapshot.dispatch.orderStream.intervalSeconds,12);
  assert.equal(snapshot.dispatch.orderStream.maxOrders,30);
  assert.equal((await send({action:'speed',value:2})).ok,true);
  const id=crypto.randomUUID(),first=await send({action:'start'},false,id),again=await send({action:'start'},false,id);
  assert.equal(first.timestamp,again.timestamp,'duplicate command must return the original receipt');
  await wait(()=>snapshot.running&&snapshot.dispatch.wave===1);
  assert.equal((await send({action:'pause'})).ok,true);
  await wait(()=>!snapshot.running);
  const paused=snapshot.elapsedSeconds,pose=JSON.stringify(snapshot.uavs.map(u=>u.position));
  await new Promise(r=>setTimeout(r,700));
  assert.equal(snapshot.elapsedSeconds,paused);
  assert.equal(JSON.stringify(snapshot.uavs.map(u=>u.position)),pose);
  assert.equal((await send({action_type:'emergency_stop',assign_agents:['all']},true)).ok,true);
  await wait(()=>!snapshot.emergencyReturn && !snapshot.running,10000);
  assert.equal((await send({action:'start'})).ok,true);
  await wait(()=>snapshot.running);
  await wait(()=>snapshot.orders.length>initialCount,45000);
  console.log('V2 WS controls and live 12-second order arrivals passed. Observing the complete dynamic 30-order mission…');
  await wait(()=>!snapshot.running&&snapshot.stats.deliveredOrders===30,600000);
  assert.equal(snapshot.dispatch.stage,'complete');
  assert.ok(snapshot.uavs.every(u=>u.phase==='docked'));
  // Rolling refill keeps one rendezvous wave open instead of waiting for an
  // all-aircraft regroup between every three assignments.
  assert.ok(snapshot.dispatch.wave>=1);
  assert.equal(snapshot.dispatch.assignments.length,30);
  assert.equal(snapshot.orders.length,30);
  assert.equal(snapshot.stats.orderStreamActive,false);
  assert.ok(snapshot.health.inferenceCount>=40);
  assert.ok(snapshot.stats.uavEnergyWh>0);
  assert.ok(Math.abs(snapshot.stats.averageUavEnergyPerOrderWh-snapshot.stats.uavEnergyWh/30)<1e-6);
  assert.ok(phases.has('picking')&&phases.has('unloading'));
  const final=structuredClone(snapshot);
  const epoch=snapshot.epoch;
  assert.equal((await send({action:'reset'})).ok,true);
  await wait(()=>snapshot.epoch!==epoch);
  assert.equal((await send({action:'start',epoch})).ok,false);
  await mkdir('output/v2-integration',{recursive:true});
  await writeFile('output/v2-integration/mqtt-acceptance.json',JSON.stringify({ok:true,transport:'MQTT over WebSocket',
    checks:['model-v2-loaded','wire-decoding','duplicate-control','pause-frozen','emergency-stop','resume','dynamic-arrivals-12s','thirty-deliveries','single-bay','Wh-metrics','reset','reject-stale-epoch'],
    initialCount,phases:[...phases],waves:[...waves],final},null,2));
  console.log('V2 complete: 30 dynamically arriving orders returned; actual energy, reset and stale epoch checks passed.');
}finally{client.end(true);}
