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

  app.post('/v1/auth/register', async (request, response) => {
    const body = request.body as { name?: unknown; email?: unknown; password?: unknown };
    if (
      typeof body.name !== 'string' ||
      body.name.trim().length < 1 ||
      body.name.trim().length > 120 ||
      typeof body.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 128
    ) {
      response
        .status(400)
        .json({ error: 'name, a valid email, and a 12-128 character password are required.' });
      return;
    }
    try {
      response.status(201).json(await runtime.auth.register(body.name, body.email, body.password));
    } catch (error) {
      response
        .status(409)
        .json({ error: error instanceof Error ? error.message : 'Unable to register account.' });
    }
  });

  app.post('/v1/auth/login', async (request, response) => {
    const body = request.body as { email?: unknown; password?: unknown };
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      response.status(400).json({ error: 'email and password are required.' });
      return;
    }
    try {
      response.status(200).json(await runtime.auth.login(body.email, body.password));
    } catch {
      response.status(401).json({ error: 'Invalid email or password.' });
    }
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
