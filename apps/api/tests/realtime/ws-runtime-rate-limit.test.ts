import { describe, expect, it, vi } from 'vitest';
import {
  CommandRouter,
  ConnectionRegistry,
  createRealtimeRuntime,
} from '../../src/realtime/index.js';
import type { RateLimiter } from '../../src/security/rate-limiter.js';

function socket() {
  const listeners = new Map<string, (v?: unknown) => void>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((e: string, l: (v?: unknown) => void) => listeners.set(e, l)),
    emit: (e: string, v?: unknown) => listeners.get(e)?.(v),
  };
}
describe('realtime connection rate limiting', () => {
  it('rejects exhausted connection capacity before authentication', async () => {
    const limiter: RateLimiter = {
      consume: vi
        .fn()
        .mockResolvedValue({ allowed: false, limit: 10, remaining: 0, retryAfterMs: 10000 }),
    };
    const auth = { authenticate: vi.fn() };
    const r = createRealtimeRuntime(
      new CommandRouter(),
      new ConnectionRegistry(),
      auth,
      { execute: vi.fn() } as never,
      {} as never,
      15000,
      undefined,
      undefined,
      undefined,
      undefined,
      limiter,
      { limit: 10, windowMs: 60000 }
    );
    const ws = socket();
    await r.accept(ws, {});
    expect(ws.close).toHaveBeenCalledWith(1008, 'Connection rate limit exceeded.');
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
});
