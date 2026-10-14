import assert from 'node:assert/strict';
import mqtt from 'mqtt';
const client=mqtt.connect('mqtt://127.0.0.1:1883',{reconnectPeriod:0});
let last=0,count=0;
try{
  await new Promise((resolve,reject)=>{client.on('connect',resolve);client.on('error',reject);});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Live backend heartbeat missing')),4500);
    client.on('message',(topic,payload)=>{
      try{
        const status=JSON.parse(payload.toString());
        if(!status.online)return;
        assert.equal(status.modelsLoaded,4);assert.ok(Number.isFinite(status.timestamp));
        assert.ok(Date.now()-status.timestamp<1800);
        if(status.timestamp>last){last=status.timestamp;if(++count>=2){clearTimeout(timeout);resolve();}}
      }catch(e){clearTimeout(timeout);reject(e);}
    });
    client.subscribe('simulation/backend/status',{qos:1});
  });
  console.log('Fresh retained backend status and repeated live heartbeat passed');
}finally{client.end(true);}
