import { describe, expect, it, vi } from 'vitest';
import {
  CommandRouter,
  ConnectionRegistry,
  createRealtimeRuntime,
} from '../../src/realtime/index.js';
import type { RateLimiter } from '../../src/security/rate-limiter.js';

function socket() {
  const listeners = new Map<string, (value?: unknown) => void>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, listener: (value?: unknown) => void) => {
      listeners.set(event, listener);
    }),
    emit(event: string, value?: unknown) {
      return listeners.get(event)?.(value);
    },
  };
}

describe('createRealtimeRuntime rate limiting', () => {
  it('rejects connection attempts when the distributed connection limit is exhausted', async () => {
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        retryAfterMs: 10_000,
      }),
    };
    const router = new CommandRouter();
    const registry = new ConnectionRegistry();
    const authenticator = { authenticate: vi.fn() };
    const disconnectRoom = { execute: vi.fn() };
    const runtime = createRealtimeRuntime(
      router,
      registry,
      authenticator,
      disconnectRoom as never,
      {} as never,
      15_000,
      undefined,
      undefined,
      undefined,
      undefined,
      rateLimiter,
      { limit: 10, windowMs: 60_000 }
    );
    const ws = socket();

    await runtime.accept(ws, {});

    expect(ws.close).toHaveBeenCalledWith(1008, 'Connection rate limit exceeded.');
    expect(authenticator.authenticate).not.toHaveBeenCalled();
  });
});
