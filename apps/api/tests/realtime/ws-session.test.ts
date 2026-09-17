import { describe, expect, it, vi } from 'vitest';
import { CommandRouter } from '../../src/realtime/command-router.js';
import { ConnectionRegistry } from '../../src/realtime/connection-registry.js';
import { createRealtimeSession } from '../../src/realtime/ws-session.js';

describe('realtime session lifecycle', () => {
  it('registers and dispatches through the router', async () => {
    const registry = new ConnectionRegistry();
    const router = new CommandRouter();
    const transport = { send: vi.fn(), close: vi.fn() };
    const handler = { type: 'ping', handle: vi.fn().mockResolvedValue({ pong: true }) };
    router.register(handler);
    const s = createRealtimeSession('c1' as never, 'u1' as never, transport, router, registry);
    await s.receive({ requestId: 'r1', type: 'ping', payload: {} });
    expect(registry.size()).toBe(1);
    expect(handler.handle).toHaveBeenCalledOnce();
    expect(transport.send).toHaveBeenCalledWith({
      requestId: 'r1',
      type: 'ping.result',
      ok: true,
      payload: { pong: true },
    });
  });

  it('removes the connection and closes once', async () => {
    const registry = new ConnectionRegistry();
    const router = new CommandRouter();
    const transport = { send: vi.fn(), close: vi.fn() };
    const s = createRealtimeSession('c1' as never, 'u1' as never, transport, router, registry);
    await s.close(1000, 'normal');
    await s.close(1000, 'normal');
    expect(registry.size()).toBe(0);
    expect(transport.close).toHaveBeenCalledOnce();
  });
});
