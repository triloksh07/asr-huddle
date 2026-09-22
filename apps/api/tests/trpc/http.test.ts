import express from 'express';
import http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '@repo/trpc';
import { createApiTRPCContext } from '../../src/trpc/runtime.js';

function createRuntime() {
  return {
    config: {
      jwtTtlSeconds: 3600,
      authMode: 'development' as const,
      rateLimits: {
        authRegisterLimit: 5,
        authRegisterWindowMs: 3600000,
        authLoginLimit: 10,
        authLoginWindowMs: 60000,
        roomCreateLimit: 5,
        roomCreateWindowMs: 3600000,
      },
    },
    auth: {
      register: vi.fn(async () => ({
        accessToken: 'token',
        user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      })),
      login: vi.fn(async () => ({
        accessToken: 'token',
        user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      })),
      authenticate: vi.fn((token: string) => {
        if (token !== 'token') throw new Error('invalid token');
        return 'u1';
      }),
    },
    authCookie: {
      read: vi.fn((request: http.IncomingMessage) =>
        request.headers.cookie === 'asr_huddle_access_token=token' ? 'token' : null
      ),
      serialize: vi.fn(() => 'asr_huddle_access_token=token; Path=/'),
      clear: vi.fn(() => 'asr_huddle_access_token=; Path=/; Max-Age=0'),
    },
    rateLimiter: {
      consume: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
    },
    roomControl: {
      create: vi.fn(async command => ({
        room: {
          id: 'room-1',
          hostUserId: command.userId,
          title: command.title,
          description: command.description,
          visibility: command.visibility,
          durationMinutes: command.durationMinutes,
          status: 'ACTIVE' as const,
          createdAt: new Date(),
          endedAt: null,
        },
        session: {
          id: 'session-1',
          roomId: 'room-1',
          startedAt: new Date(),
          expiresAt: new Date(),
          status: 'ACTIVE' as const,
          expiryWarningIssuedAt: null,
          endedAt: null,
        },
      })),
      listPublic: vi.fn(async () => []),
      get: vi.fn(async () => ({
        id: 'room-1',
        hostUserId: 'u1',
        title: 'Room',
        description: '',
        visibility: 'PUBLIC' as const,
        durationMinutes: 60 as const,
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        endedAt: null,
      })),
      endAsHost: vi.fn(async () => undefined),
    },
  };
}

async function requestJson(
  server: http.Server,
  path: string,
  options: { method?: string; body?: unknown; authorization?: string; cookie?: string } = {}
) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server address unavailable');

  return await new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }>(
    (resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path,
          method: options.method ?? 'GET',
          headers: {
            'content-type': 'application/json',
            ...(options.authorization ? { authorization: options.authorization } : {}),
            ...(options.cookie ? { cookie: options.cookie } : {}),
          },
        },
        res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              body: data ? JSON.parse(data) : undefined,
              headers: res.headers,
            });
          });
        }
      );
      req.on('error', reject);
      if (options.body !== undefined) req.write(JSON.stringify(options.body));
      req.end();
    }
  );
}

async function createTestServer() {
  const runtime = createRuntime();
  const app = express();
  app.use(express.json());
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createApiTRPCContext(runtime as any),
    })
  );

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, runtime };
}

describe('tRPC HTTP adapter', () => {
  it('serves a public auth mutation without exposing the access token', async () => {
    const { server, runtime } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/auth.register', {
        method: 'POST',
        body: {
          name: 'Alice',
          email: 'alice@example.com',
          password: 'a-valid-password',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.result.data).toEqual({
        user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      });
      expect(response.body.result.data).not.toHaveProperty('accessToken');
      expect(runtime.auth.register).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('rejects a protected query without credentials', async () => {
    const { server } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/room.listPublic');
      expect(response.status).toBe(401);
      expect(response.body.error.data.code).toBe('UNAUTHORIZED');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('accepts cookie authentication for protected procedures', async () => {
    const { server, runtime } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/room.listPublic', {
        cookie: 'asr_huddle_access_token=token',
      });

      expect(response.status).toBe(200);
      expect(response.body.result.data).toEqual([]);
      expect(runtime.auth.authenticate).toHaveBeenCalledWith('token');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('accepts the existing bearer-token authentication path', async () => {
    const { server, runtime } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/room.listPublic', {
        authorization: 'Bearer token',
      });

      expect(response.status).toBe(200);
      expect(response.body.result.data).toEqual([]);
      expect(runtime.auth.authenticate).toHaveBeenCalledWith('token');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('clears the authentication cookie through logout', async () => {
    const { server, runtime } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/auth.logout', { method: 'POST' });

      expect(response.status).toBe(200);
      expect(response.body.result.data).toEqual({ success: true });
      expect(response.headers['set-cookie']).toEqual([
        'asr_huddle_access_token=; Path=/; Max-Age=0',
      ]);
      expect(runtime.authCookie.clear).toHaveBeenCalledWith(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('preserves the room application boundary and does not let HTTP input supply userId', async () => {
    const { server, runtime } = await createTestServer();

    try {
      const response = await requestJson(server, '/trpc/room.create', {
        method: 'POST',
        authorization: 'Bearer token',
        body: {
          title: 'Room',
          description: '',
          visibility: 'PUBLIC',
          durationMinutes: 60,
          userId: 'attacker-controlled-id',
        },
      });

      expect(response.status).toBe(200);
      expect(runtime.roomControl.create).toHaveBeenCalledWith({
        userId: 'u1',
        title: 'Room',
        description: '',
        visibility: 'PUBLIC',
        durationMinutes: 60,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });
});
