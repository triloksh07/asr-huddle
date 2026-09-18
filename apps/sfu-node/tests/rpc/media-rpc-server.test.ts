import { describe, expect, it, vi } from 'vitest';
import { MediaRpcServer } from '../../src/rpc/media-rpc-server.js';

describe('MediaRpcServer', () => {
  function makeResponse() {
    return {
      statusCode: 0,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end: vi.fn(),
    };
  }

  function makeRequest(body: unknown) {
    return {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(body));
      },
    };
  }

  it('dispatches createTransport and returns its result', async () => {
    const media = {
      createWebRtcTransport: vi.fn().mockResolvedValue({ transportId: 'transport-1' }),
    } as never;
    const server = new MediaRpcServer(media, 'secret');
    const response = makeResponse();
    await server.handle(
      makeRequest({
        requestId: 'request-1',
        method: 'media.createTransport',
        params: {
          roomId: 'room-1',
          roomSessionId: 'session-1',
          participantId: 'participant-1',
          participantSessionId: 'participant-session-1',
          connectionId: 'connection-1',
        },
      }) as never,
      response as never
    );
    expect(media.createWebRtcTransport).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      requestId: 'request-1',
      ok: true,
      result: { transportId: 'transport-1' },
    });
  });

  it('normalizes void results to null on the wire', async () => {
    const media = { revokeAudioProduction: vi.fn().mockResolvedValue(undefined) } as never;
    const server = new MediaRpcServer(media, 'secret');
    const response = makeResponse();
    await server.handle(
      makeRequest({
        requestId: 'request-2',
        method: 'media.revokeAudioProduction',
        params: {
          roomId: 'room-1',
          roomSessionId: 'session-1',
          participantId: 'participant-1',
          participantSessionId: 'participant-session-1',
          connectionId: 'connection-1',
        },
      }) as never,
      response as never
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
      requestId: 'request-2',
      ok: true,
      result: null,
    });
  });

  it('rejects method-specific invalid params before dispatch', async () => {
    const media = { revokeAudioProduction: vi.fn() } as never;
    const server = new MediaRpcServer(media, 'secret');
    const response = makeResponse();
    await server.handle(
      makeRequest({
        requestId: 'request-3',
        method: 'media.revokeAudioProduction',
        params: { roomId: 'room-1', roomSessionId: 'session-1', participantId: 'participant-1' },
      }) as never,
      response as never
    );
    expect(media.revokeAudioProduction).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      requestId: 'request-3',
      ok: false,
      error: { code: 'INVALID_MEDIA_RPC' },
    });
  });
});
