// Browser transport for an existing local TCP broker; do not replace or stop it.
import net from 'node:net';
import http from 'node:http';
import { WebSocketServer, createWebSocketStream } from 'ws';
const web = http.createServer((_, res) => {res.writeHead(200); res.end('Campus MQTT WebSocket bridge');});
const sockets = new WebSocketServer({server:web,path:'/mqtt'});
sockets.on('connection', socket => {
  const stream = createWebSocketStream(socket);
  const upstream = net.connect(1883,'127.0.0.1');
  stream.pipe(upstream).pipe(stream);
  stream.on('error',()=>upstream.destroy());
  upstream.on('error',()=>stream.destroy());
  stream.on('close',()=>upstream.destroy());
  upstream.on('close',()=>stream.destroy());
});
web.on('error',error=>{console.error(error.message);process.exit(1);});
web.listen(8083,'127.0.0.1',()=>console.log('MQTT WS bridge: 8083 -> existing local broker 1883'));
process.on('SIGINT',()=>{sockets.close();web.close(()=>process.exit(0));});
