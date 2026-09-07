import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { createWorkerPool } from './mediasoup/workerPool.js';

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket Connection Entrypoint
wss.on('connection', ws => {
  console.log('[WS] New client connected');

  ws.on('message', rawData => {
    try {
      const message = JSON.parse(rawData);
      console.log('[WS] Received:', message);

      // TODO: Route through jsonrpc signaling handler
    } catch (err) {
      console.error('[WS] Invalid JSON received');
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    // TODO: Trigger room disconnect grace window
  });
});

// Bootstrap Application
async function run() {
  await createWorkerPool();

  server.listen(config.listenPort, () => {
    console.log(`\n==================================================`);
    console.log(` ASR Engine listening on http://localhost:${config.listenPort}`);
    console.log(`==================================================\n`);
  });
}

run().catch(err => {
  console.error('[Fatal Engine Startup Error]', err);
  process.exit(1);
});
