import mqtt from 'mqtt';
const client = mqtt.connect('mqtt://127.0.0.1:1883', { connectTimeout: 2000, reconnectPeriod: 0 });
const timer = setTimeout(() => { console.error('MEC not ready: inspect output/backend/mec.stderr.log'); client.end(true); process.exitCode = 1; }, 10000);
client.on('connect', () => client.subscribe('simulation/snapshot'));
client.on('message', (_, payload) => {
  const snapshot = JSON.parse(payload.toString());
  if (Date.now() - snapshot.timestamp > 1800 || !snapshot.health.online || snapshot.health.modelsLoaded !== 4) return;
  const aiStatus = snapshot.health.agentVerified ? 'verified' : snapshot.health.agentConfigured ? 'configured, dispatch not verified' : 'not configured';
  console.log(`MEC ready: ${snapshot.health.modelsLoaded} models / ${snapshot.orders.length} parcels / AI ${aiStatus}`);
  clearTimeout(timer);
  client.end();
});
client.on('error', error => { console.error(error.message); clearTimeout(timer); client.end(true); process.exitCode = 1; });
