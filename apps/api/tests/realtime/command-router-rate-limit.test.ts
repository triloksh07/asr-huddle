import { describe, expect, it, vi } from 'vitest';
import { CommandRouter } from '../../src/realtime/command-router.js';
import type { RateLimiter } from '../../src/security/rate-limiter.js';
import { RealtimeRateLimitPolicy } from '../../src/security/realtime-rate-limit-policy.js';
import type { RateLimitConfig } from '../../src/config.js';

const rateLimits: RateLimitConfig = {
  authRegisterLimit: 5,
  authRegisterWindowMs: 3_600_000,
  authLoginLimit: 10,
  authLoginWindowMs: 60_000,
  connectionLimit: 10,
  connectionWindowMs: 60_000,
  commandLimit: 100,
  commandWindowMs: 10_000,
  sessionLimit: 10,
  sessionWindowMs: 60_000,
  roomCreateLimit: 5,
  roomCreateWindowMs: 3_600_000,
  speakerRequestLimit: 5,
  speakerRequestWindowMs: 30_000,
  reactionBurstLimit: 5,
  reactionBurstWindowMs: 1_000,
  reactionSameTypeWindowMs: 4_000,
  mediaLimit: 60,
  mediaWindowMs: 10_000,
  maxViolations: 2,
  violationWindowMs: 10_000,
};

function createContext() {
  return {
    connection: {
      connectionId: 'connection-1',
      userId: 'user-1',
      participantId: 'participant-1',
      participantSessionId: 'session-1',
      roomId: 'room-1',
      roomSessionId: 'room-session-1',
      connectedAt: new Date().toISOString(),
    },
    transport: {
      send: vi.fn(),
      close: vi.fn(),
    },
  };
}

describe('CommandRouter rate limiting', () => {
  it('rejects a rate-limited command without invoking the handler', async () => {
    const context = createContext();
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 5,
        remaining: 0,
        retryAfterMs: 500,
      }),
    };
    const router = new CommandRouter({
      rateLimiter,
      rateLimitPolicy: new RealtimeRateLimitPolicy(rateLimits),
    });
    const handler = {
      type: 'room.reaction',
      handle: vi.fn().mockResolvedValue(undefined),
    };
    router.register(handler);

    const result = await router.dispatch(context, {
      requestId: 'request-1',
      type: 'room.reaction',
      payload: { type: '🔥' },
    });

    expect(result.error?.code).toBe('RATE_LIMITED');
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('allows unrelated commands when the rate limiter is configured', async () => {
    const context = createContext();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(),
    };
    const router = new CommandRouter({
      rateLimiter,
      rateLimitPolicy: new RealtimeRateLimitPolicy(rateLimits),
    });
    const handler = {
      type: 'room.leave',
      handle: vi.fn().mockResolvedValue(undefined),
    };
    router.register(handler);

    const result = await router.dispatch(context, {
      requestId: 'request-1',
      type: 'room.leave',
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it('reports repeated rate-limit abuse so the realtime runtime can close the connection', async () => {
    const context = createContext();
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 1,
        remaining: 0,
        retryAfterMs: 500,
      }),
    };
    const router = new CommandRouter({
      rateLimiter,
      rateLimitPolicy: new RealtimeRateLimitPolicy(rateLimits),
      maxRateLimitViolations: 2,
      rateLimitViolationWindowMs: 10_000,
    });
    router.register({
      type: 'speaker.request',
      handle: vi.fn().mockResolvedValue(undefined),
    });

    await router.dispatch(context, {
      requestId: 'request-1',
      type: 'speaker.request',
      payload: { roomId: 'room-1' },
    });
    expect(router.shouldCloseForRateLimit(context.connection)).toBe(false);

    await router.dispatch(context, {
      requestId: 'request-2',
      type: 'speaker.request',
      payload: { roomId: 'room-1' },
    });
    expect(router.shouldCloseForRateLimit(context.connection)).toBe(true);
  });
});
