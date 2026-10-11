// A local MQTT broker over WebSocket, so tests can run several devices together without
// the internet. The multi-device tests point the app at it with ?broker=ws://127.0.0.1:8884.
import { createServer } from 'node:http';
import createBroker from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';

const broker = createBroker();
const server = createServer((req, res) => res.writeHead(200).end('mqtt broker'));
new WebSocketServer({ server }).on('connection', (socket) => broker.handle(createWebSocketStream(socket)));
server.listen(Number(process.env.BROKER_PORT ?? 8884), '127.0.0.1');
