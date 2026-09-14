import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { ApiRuntime } from './composition-root.js';
import { serializeAuthCookie } from '../auth/auth-cookie.js';
import { RateLimitInfrastructureError } from '../security/rate-limiter.js';

export interface RunningServer {
  readonly server: http.Server;
  readonly close: () => Promise<void>;
}

async function enforceHttpRateLimit(
  rateLimiter: ApiRuntime['rateLimiter'],
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
  response: express.Response
): Promise<boolean> {
  try {
    const decision = await rateLimiter.consume(scope, identifier, { limit, windowMs });
    if (decision.allowed) return true;

    response.setHeader(
      'Retry-After',
      String(Math.max(1, Math.ceil(decision.retryAfterMs / 1_000)))
    );
    response.status(429).json({ error: 'Too many requests. Please try again later.' });
    return false;
  } catch (error) {
    if (error instanceof RateLimitInfrastructureError) {
      response.status(503).json({ error: 'This operation is temporarily unavailable.' });
      return false;
    }
    throw error;
  }
}

export async function startServer(runtime: ApiRuntime): Promise<RunningServer> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.once('finish', () => {
      const durationMs = performance.now() - startedAt;
      runtime.metrics.recordHttpRequest(response.statusCode, durationMs);
      runtime.logger.info('http_request_completed', {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });
    next();
  });

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
    if (
      !(await enforceHttpRateLimit(
        runtime.rateLimiter,
        'http.auth.register',
        request.ip ?? '',
        runtime.config.rateLimits.authRegisterLimit,
        runtime.config.rateLimits.authRegisterWindowMs,
        response
      ))
    )
      return;

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
      const result = await runtime.auth.register(body.name, body.email, body.password);
      response
        .status(201)
        .setHeader(
          'Set-Cookie',
          serializeAuthCookie(
            result.accessToken,
            runtime.config.jwtTtlSeconds,
            runtime.config.authMode === 'production'
          )
        )
        .json(result);
    } catch (error) {
      response
        .status(409)
        .json({ error: error instanceof Error ? error.message : 'Unable to register account.' });
    }
  });

  app.post('/v1/auth/login', async (request, response) => {
    if (
      !(await enforceHttpRateLimit(
        runtime.rateLimiter,
        'http.auth.login',
        request.ip ?? '',
        runtime.config.rateLimits.authLoginLimit,
        runtime.config.rateLimits.authLoginWindowMs,
        response
      ))
    )
      return;

    const body = request.body as { email?: unknown; password?: unknown };
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      response.status(400).json({ error: 'email and password are required.' });
      return;
    }
    try {
      const result = await runtime.auth.login(body.email, body.password);
      response
        .status(200)
        .setHeader(
          'Set-Cookie',
          serializeAuthCookie(
            result.accessToken,
            runtime.config.jwtTtlSeconds,
            runtime.config.authMode === 'production'
          )
        )
        .json(result);
    } catch {
      response.status(401).json({ error: 'Invalid email or password.' });
    }
  });

  const authenticatedUserId = (request: express.Request): string | null => {
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    try {
      return runtime.auth.authenticate(header.slice(7));
    } catch {
      return null;
    }
  };

  app.post('/v1/rooms', async (request, response) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      response.status(401).json({ error: 'Authentication is required.' });
      return;
    }

    if (
      !(await enforceHttpRateLimit(
        runtime.rateLimiter,
        'http.room.create',
        userId,
        runtime.config.rateLimits.roomCreateLimit,
        runtime.config.rateLimits.roomCreateWindowMs,
        response
      ))
    )
      return;

    const body = request.body as {
      title?: unknown;
      description?: unknown;
      visibility?: unknown;
      durationMinutes?: unknown;
    };
    if (
      typeof body.title !== 'string' ||
      body.title.trim().length < 1 ||
      body.title.trim().length > 100 ||
      typeof body.description !== 'string' ||
      body.description.length > 500 ||
      (body.visibility !== 'PUBLIC' && body.visibility !== 'LINK_ONLY') ||
      ![60, 120, 300].includes(body.durationMinutes as number)
    ) {
      response.status(400).json({
        error: 'title, description, visibility, and a 60/120/300 minute duration are required.',
      });
      return;
    }
    const created = await runtime.roomControl.create({
      userId,
      title: body.title.trim(),
      description: body.description.trim(),
      visibility: body.visibility,
      durationMinutes: body.durationMinutes as 60 | 120 | 300,
    });
    response.status(201).json(created);
  });

  app.get('/v1/rooms', async (request, response) => {
    if (!authenticatedUserId(request)) {
      response.status(401).json({ error: 'Authentication is required.' });
      return;
    }
    response.status(200).json({ rooms: await runtime.roomControl.listPublic() });
  });

  app.get('/v1/rooms/:roomId', async (request, response) => {
    if (!authenticatedUserId(request)) {
      response.status(401).json({ error: 'Authentication is required.' });
      return;
    }
    try {
      response.status(200).json(await runtime.roomControl.get(request.params.roomId));
    } catch {
      response.status(404).json({ error: 'Room was not found.' });
    }
  });

  app.post('/v1/rooms/:roomId/end', async (request, response) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      response.status(401).json({ error: 'Authentication is required.' });
      return;
    }
    try {
      await runtime.roomControl.endAsHost(request.params.roomId, userId);
      response.status(204).end();
    } catch (error) {
      response
        .status(error instanceof Error && error.message.includes('Only the room host') ? 403 : 404)
        .json({ error: error instanceof Error ? error.message : 'Unable to end room.' });
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
