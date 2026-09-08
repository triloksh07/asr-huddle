import express from 'express';
import { createServer } from 'node:http';
// import { Server } from 'ws';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { SfuClient } from './sfuClient.js';
import { WsGateway } from './wsGateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const app = express();
  app.use(express.json());

  // Serve Client Dashboard
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));

  // Health Check Endpoint
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/v1/ws' });

  const sfuClient = new SfuClient(CONFIG.redisUrl);
  const wsGateway = new WsGateway(wss, CONFIG.redisUrl, sfuClient);

  wsGateway.init();

  server.listen(CONFIG.port, () => {
    console.log(`[API Control Plane] Running at http://localhost:${CONFIG.port}`);
    console.log(`[WS Gateway] Endpoint live at ws://localhost:${CONFIG.port}/v1/ws`);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down API Control Plane...');
    await sfuClient.close();
    server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error starting API Control Plane:', err);
  process.exit(1);
});
