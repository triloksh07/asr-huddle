import { describe, expect, it, vi } from 'vitest';
import type { RealtimeConnection } from '../../src/realtime/types.js';
import { ConnectionRegistry } from '../../src/realtime/connection-registry.js';

function c(id: string): RealtimeConnection {
  return {
    connectionId: id as never,
    userId: 'u1' as never,
    participantId: 'p1' as never,
    participantSessionId: 'ps1' as never,
    roomId: 'r1' as never,
    roomSessionId: 'rs1' as never,
    connectedAt: new Date().toISOString(),
    transport: { send: vi.fn(), close: vi.fn() },
  };
}

describe('ConnectionRegistry', () => {
  it('indexes active connections', () => {
    const r = new ConnectionRegistry();
    r.add(c('c1'));
    expect(r.get('c1' as never)?.userId).toBe('u1');
    expect(r.getByUser('u1' as never)?.connectionId).toBe('c1');
    expect(r.getByParticipant('p1' as never)?.connectionId).toBe('c1');
  });

  it('removes indexes with the connection', () => {
    const r = new ConnectionRegistry();
    r.add(c('c1'));
    r.remove('c1' as never);
    expect(r.get('c1' as never)).toBeUndefined();
    expect(r.getByUser('u1' as never)).toBeUndefined();
    expect(r.getByParticipant('p1' as never)).toBeUndefined();
  });

  it('replaces a participant connection without stale indexes', () => {
    const r = new ConnectionRegistry();
    r.add(c('c1'));
    r.add(c('c2'));
    expect(r.size()).toBe(1);
    expect(r.getByParticipant('p1' as never)?.connectionId).toBe('c2');
  });
});
