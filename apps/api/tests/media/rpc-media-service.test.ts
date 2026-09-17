import { describe, expect, it, vi } from 'vitest';
import { RpcMediaService } from '../../src/media/rpc-media-service.js';

const ctx = {
  roomId: 'room-1' as never,
  roomSessionId: 'room-session-1' as never,
  participantId: 'participant-1' as never,
  participantSessionId: 'participant-session-1' as never,
};

describe('RpcMediaService', () => {
  it('sends the media RPC with room/session identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'rpc-1',
        ok: true,
        result: { transportId: 't1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} },
      }),
    });
    const result = await new RpcMediaService({
      baseUrl: 'http://sfu:4001',
      fetchImpl,
    }).createWebRtcTransport(ctx);
    expect(result.transportId).toBe('t1');
    expect(JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      method: 'media.createTransport',
      params: expect.objectContaining({
        roomId: 'room-1',
        roomSessionId: 'room-session-1',
        participantId: 'participant-1',
      }),
    });
  });

  it('maps upstream failures to MediaControlError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        requestId: 'rpc-1',
        ok: false,
        error: { code: 'MEDIA_ROOM_NOT_FOUND', message: 'No media router exists.' },
      }),
    });
    await expect(
      new RpcMediaService({ baseUrl: 'http://sfu:4001', fetchImpl }).createWebRtcTransport(ctx)
    ).rejects.toMatchObject({ code: 'MEDIA_ROOM_NOT_FOUND' });
  });
});
