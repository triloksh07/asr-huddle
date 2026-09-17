import { describe, expect, it, vi } from 'vitest';
import { CommandRouter, CreateMediaTransportCommand } from '../../src/realtime/index.js';
import type { RealtimeCommandContext } from '../../src/realtime/types.js';

const context = (roomSessionId: string | null = 'room-session-1'): RealtimeCommandContext => ({
  connection: {
    connectionId: 'c1' as never,
    userId: 'u1' as never,
    participantId: 'p1' as never,
    participantSessionId: 'ps1' as never,
    roomId: 'r1' as never,
    roomSessionId: roomSessionId as never,
    connectedAt: new Date().toISOString(),
  },
  transport: { send: vi.fn(), close: vi.fn() },
});

describe('media realtime commands', () => {
  it('passes the realtime media session and validated direction', async () => {
    const media = { createTransport: vi.fn().mockResolvedValue({ transportId: 't1' }) };
    const router = new CommandRouter();
    router.register(new CreateMediaTransportCommand(media as never));
    const result = await router.dispatch(context(), {
      requestId: 'r1',
      type: 'media.transport.create',
      payload: { direction: 'recv' },
    });
    expect(result.ok).toBe(true);
    expect(media.createTransport).toHaveBeenCalled();
  });

  it('rejects media commands without a room session', async () => {
    const media = { createTransport: vi.fn() };
    const router = new CommandRouter();
    router.register(new CreateMediaTransportCommand(media as never));
    const result = await router.dispatch(context(null), {
      requestId: 'r1',
      type: 'media.transport.create',
      payload: { direction: 'recv' },
    });
    expect(result.error?.code).toBe('INVALID_MEDIA_SESSION');
    expect(media.createTransport).not.toHaveBeenCalled();
  });
});
