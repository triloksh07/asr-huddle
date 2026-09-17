import { describe, expect, it, vi } from 'vitest';
import {
  CommandRouter,
  ConnectionRegistry,
  createRealtimeRuntime,
} from '../../src/realtime/index.js';

function socket() {
  const listeners = new Map<string, (v?: unknown) => void>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((e: string, l: (v?: unknown) => void) => listeners.set(e, l)),
    emit: (e: string, v?: unknown) => listeners.get(e)?.(v),
  };
}
function makeRuntime(options: Record<string, number> = {}) {
  return createRealtimeRuntime(
    new CommandRouter(),
    new ConnectionRegistry(),
    { authenticate: vi.fn().mockResolvedValue('u1') },
    { execute: vi.fn() } as never,
    {} as never,
    15000,
    undefined,
    undefined,
    options.maxMessageBytes,
    options.maxProtocolViolations
  );
}

describe('createRealtimeRuntime', () => {
  it('accepts text and Buffer JSON frames', async () => {
    const r = makeRuntime();
    const ws = socket();
    await r.accept(ws, {});
    await ws.emit('message', JSON.stringify({ requestId: 'r1', type: 'unknown', payload: {} }));
    await ws.emit(
      'message',
      Buffer.from(JSON.stringify({ requestId: 'r2', type: 'unknown', payload: {} }))
    );
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it('closes oversized messages with 1009', async () => {
    const ws = socket();
    await makeRuntime({ maxMessageBytes: 16 }).accept(ws, {});
    await ws.emit('message', JSON.stringify({ requestId: 'r1', type: 'unknown', payload: {} }));
    expect(ws.close).toHaveBeenCalledWith(1009, 'Message too large.');
  });

  it('closes after repeated protocol violations', async () => {
    const ws = socket();
    await makeRuntime({ maxProtocolViolations: 2 }).accept(ws, {});
    await ws.emit('message', '{bad');
    await ws.emit('message', '{bad');
    expect(ws.close).toHaveBeenCalledWith(1008, 'Protocol violation limit exceeded.');
  });
});
