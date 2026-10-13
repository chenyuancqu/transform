import { Aedes } from 'aedes';
import net from 'node:net';
import http from 'node:http';
import { WebSocketServer, createWebSocketStream } from 'ws';

// Local demonstration bus. Replace with EMQX/Mosquitto for deployment.
const broker = await Aedes.createBroker();
const tcp = net.createServer(broker.handle);
const web = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'campus-mqtt', tcp: 1883, websocket: '/mqtt' }));
});
const sockets = new WebSocketServer({ server: web, path: '/mqtt' });
sockets.on('connection', socket => broker.handle(createWebSocketStream(socket)));
broker.on('clientError', (client, error) => console.error('MQTT client error:', error.message));
tcp.listen(1883, '127.0.0.1', () => console.log('MQTT TCP: 127.0.0.1:1883'));
web.listen(8083, '127.0.0.1', () => console.log('MQTT WS: ws://127.0.0.1:8083/mqtt'));
for (const server of [tcp, web]) server.on('error', error => { console.error(error.message); process.exit(1); });
process.on('SIGINT', () => { sockets.close(); tcp.close(); web.close(); broker.close(() => process.exit(0)); });
