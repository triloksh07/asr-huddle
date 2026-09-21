import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router/index.js';
import type { TRPCContext } from '../src/context/index.js';

function createContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  const auth = {
    register: vi.fn(async () => ({
      accessToken: 'token',
      user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    })),
    login: vi.fn(async () => ({
      accessToken: 'token',
      user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    })),
    authenticate: vi.fn(() => 'u1'),
  };

  const runtime = {
    auth,
    authCookie: {
      read: vi.fn(() => null),
      serialize: vi.fn(() => 'asr_huddle_access_token=token; Path=/'),
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
        title: 'Test room',
        description: '',
        visibility: 'PUBLIC' as const,
        durationMinutes: 60 as const,
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        endedAt: null,
      })),
      endAsHost: vi.fn(async () => ({
        status: 'ENDED' as const,
        roomId: 'room-1',
        roomSessionId: 'session-1',
      })),
    },
  };
  return {
    runtime,
    request: { socket: { remoteAddress: '127.0.0.1' }, headers: {} },
    response: { setHeader: vi.fn() },
    user: { id: 'u1' },
    ...overrides,
  } as unknown as TRPCContext;
}

describe('tRPC application router', () => {
  it('keeps auth.register as a public mutation and preserves auth output', async () => {
    const ctx = createContext({ user: null });
    const result = await appRouter
      .createCaller(ctx)
      .auth.register({ name: 'Alice', email: 'alice@example.com', password: 'a-valid-password' });
    expect(result).toEqual({
      accessToken: 'token',
      user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    });
  });
  it('requires authentication for room operations', async () => {
    await expect(
      appRouter.createCaller(createContext({ user: null })).room.listPublic()
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('does not accept a client-supplied user id for room.create', async () => {
    const ctx = createContext();
    await appRouter
      .createCaller(ctx)
      .room.create({ title: 'Room', description: '', visibility: 'PUBLIC', durationMinutes: 60 });
    expect(ctx.runtime.roomControl.create).toHaveBeenCalledWith({
      userId: 'u1',
      title: 'Room',
      description: '',
      visibility: 'PUBLIC',
      durationMinutes: 60,
    });
  });
  it('returns an explicit result when room.end actually ends the room', async () => {
    const ctx = createContext();
    const result = await appRouter.createCaller(ctx).room.end({ roomId: 'room-1' });
    expect(result).toEqual({
      success: true,
      roomId: 'room-1',
      status: 'ENDED',
      roomSessionId: 'session-1',
    });
    expect(ctx.runtime.roomControl.endAsHost).toHaveBeenCalledWith('room-1', 'u1');
  });
  it('reports an already-ended room without executing another end transition', async () => {
    const ctx = createContext();
    ctx.runtime.roomControl.endAsHost = vi.fn(async () => ({
      status: 'ALREADY_ENDED' as const,
      roomId: 'room-1',
      success: true as const,
    })) as typeof ctx.runtime.roomControl.endAsHost;
    const result = await appRouter.createCaller(ctx).room.end({ roomId: 'room-1' });
    expect(result).toEqual({ success: true, roomId: 'room-1', status: 'ALREADY_ENDED' });
  });
});
