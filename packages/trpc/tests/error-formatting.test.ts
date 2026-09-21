import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router/index.js';
import type { TRPCContext } from '../src/context/index.js';

function createContext(): TRPCContext {
  const logger = { error: vi.fn() };

  const runtime = {
    auth: {
      register: vi.fn(),
      login: vi.fn(),
      authenticate: vi.fn(() => 'u1'),
    },
    authCookie: {
      read: vi.fn(() => null),
      serialize: vi.fn(() => ''),
    },
    rateLimiter: {
      consume: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
    },
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
    roomControl: {
      create: vi.fn(),
      listPublic: vi.fn(async () => []),
      get: vi.fn(async () => {
        throw new Error('database details');
      }),
      endAsHost: vi.fn(),
    },
    logger,
  };

  return {
    runtime,
    request: { socket: { remoteAddress: '127.0.0.1' }, headers: {} },
    response: { setHeader: vi.fn() },
    user: { id: 'u1' },
  } as unknown as TRPCContext;
}

describe('tRPC error formatting', () => {
  it('does not expose the server stack while logging the original error server-side', async () => {
    const ctx = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.room.get({ roomId: 'room-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(ctx.runtime.logger?.error).toHaveBeenCalledWith(
      'trpc_request_failed',
      expect.objectContaining({
        code: 'NOT_FOUND',
        error: expect.any(Error),
      })
    );
  });
});
