import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { ApiRuntime } from './composition-root.js';

export interface RunningServer {
  readonly server: http.Server;
  readonly close: () => Promise<void>;
}

export async function startServer(runtime: ApiRuntime): Promise<RunningServer> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/metrics', (_request, response) => {
    response.status(200).type('text/plain').send(runtime.metrics.prometheus(runtime.registry));
  });

  const server = http.createServer(app);
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname !== '/v1/ws') {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, webSocket => {
      websocketServer.emit('connection', webSocket, request);
    });
  });

  websocketServer.on('connection', async (socket, request) => {
    try {
      await runtime.realtime.accept(socket, request);
    } catch (error) {
      socket.close(1008, error instanceof Error ? error.message : 'Authentication failed.');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(runtime.config.port, resolve);
  });

  return {
    server,
    close: async () => {
      websocketServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    },
  };
}
