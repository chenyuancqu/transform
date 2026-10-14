// Pause the real local mission at an observable phase for visual review.
import mqtt from 'mqtt';
import {writeFile,mkdir} from 'node:fs/promises';
const phase=process.argv[2]||'picking';
if(!['picking','unloading','reset'].includes(phase))throw new Error('Expected picking, unloading or reset');
const client=mqtt.connect('mqtt://127.0.0.1:1883',{reconnectPeriod:0,clientId:'visual_review_'+Date.now()});
let snapshot;const replies=new Map();
const waitFor=async(predicate,timeout=10000)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw new Error('Visual phase timed out');await new Promise(r=>setTimeout(r,40));}};
client.on('message',(topic,payload)=>{const d=JSON.parse(payload.toString());if(topic==='simulation/snapshot')snapshot=d;else if(d.request_id)replies.set(d.request_id,d);});
await new Promise((resolve,reject)=>{client.on('connect',resolve);client.on('error',reject);});
await new Promise((resolve,reject)=>client.subscribe(['simulation/snapshot','simulation/command/result'],{qos:1},e=>e?reject(e):resolve()));
async function control(data){const id=crypto.randomUUID();client.publish('simulation/control',JSON.stringify({...data,request_id:id}),{qos:1});await waitFor(()=>replies.has(id));if(!replies.get(id).ok)throw new Error(replies.get(id).message);}
try{
  await waitFor(()=>snapshot?.health.online);
  if(phase==='reset'||process.argv.includes('--reset'))await control({action:'reset'});
  if(phase==='reset'){await control({action:'speed',value:.7});console.log('Reset: ready for user presentation');}
  else{
    await control({action:'speed',value:2});await control({action:'start'});
    const match=()=>snapshot.uavs.find(u=>u.phase===phase&&(phase==='picking'?u.pickupProgress:u.unloadProgress)>=.45);
    await waitFor(match,120000);const id=match().id;await control({action:'pause'});await waitFor(()=>!snapshot.running);
    await mkdir('output/visual-sample-20261014',{recursive:true});await writeFile(`output/visual-sample-20261014/${phase}-telemetry.json`,JSON.stringify(snapshot,null,2));
    console.log(JSON.stringify({phase,id,simulationSeconds:snapshot.elapsedSeconds,uav:snapshot.uavs.find(u=>u.id===id),docking:snapshot.docking}));
  }
}finally{client.end(true);}
