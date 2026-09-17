import { describe, expect, it, vi } from 'vitest';
import { CommandRouter } from '../../src/realtime/command-router.js';
import type { RateLimiter } from '../../src/security/rate-limiter.js';
import { RealtimeRateLimitPolicy } from '../../src/security/realtime-rate-limit-policy.js';
import type { RateLimitConfig } from '../../src/config.js';

const limits: RateLimitConfig = {
  authRegisterLimit: 5,
  authRegisterWindowMs: 3600000,
  authLoginLimit: 10,
  authLoginWindowMs: 60000,
  connectionLimit: 10,
  connectionWindowMs: 60000,
  commandLimit: 100,
  commandWindowMs: 10000,
  sessionLimit: 10,
  sessionWindowMs: 60000,
  roomCreateLimit: 5,
  roomCreateWindowMs: 3600000,
  speakerRequestLimit: 5,
  speakerRequestWindowMs: 30000,
  reactionBurstLimit: 5,
  reactionBurstWindowMs: 1000,
  reactionSameTypeWindowMs: 4000,
  mediaLimit: 60,
  mediaWindowMs: 10000,
  maxViolations: 2,
  violationWindowMs: 10000,
};
const ctx = () => ({
  connection: {
    connectionId: 'c1',
    userId: 'u1',
    participantId: 'p1',
    participantSessionId: 'ps1',
    roomId: 'r1',
    roomSessionId: 'rs1',
    connectedAt: new Date().toISOString(),
  },
  transport: { send: vi.fn(), close: vi.fn() },
});

describe('CommandRouter rate limiting', () => {
  it('does not invoke a handler when a policy check is denied', async () => {
    const limiter: RateLimiter = {
      consume: vi
        .fn()
        .mockResolvedValue({ allowed: false, limit: 1, remaining: 0, retryAfterMs: 100 }),
    };
    const router = new CommandRouter({
      rateLimiter: limiter,
      rateLimitPolicy: new RealtimeRateLimitPolicy(limits),
    });
    const handler = { type: 'speaker.request', handle: vi.fn() };
    router.register(handler);
    expect(
      (await router.dispatch(ctx(), { requestId: 'r1', type: 'speaker.request', payload: {} }))
        .error?.code
    ).toBe('RATE_LIMITED');
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('tracks repeated violations per connection', async () => {
    const limiter: RateLimiter = {
      consume: vi
        .fn()
        .mockResolvedValue({ allowed: false, limit: 1, remaining: 0, retryAfterMs: 100 }),
    };
    const router = new CommandRouter({
      rateLimiter: limiter,
      rateLimitPolicy: new RealtimeRateLimitPolicy(limits),
      maxRateLimitViolations: 2,
      rateLimitViolationWindowMs: 10000,
    });
    router.register({ type: 'speaker.request', handle: vi.fn() });
    await router.dispatch(ctx(), { requestId: 'r1', type: 'speaker.request', payload: {} });
    await router.dispatch(ctx(), { requestId: 'r2', type: 'speaker.request', payload: {} });
    expect(router.shouldCloseForRateLimit(ctx().connection)).toBe(true);
  });
});
