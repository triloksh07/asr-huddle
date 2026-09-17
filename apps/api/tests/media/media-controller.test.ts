import { describe, expect, it, vi } from 'vitest';
import { createParticipant, createParticipantSession } from '@repo/domain';
import type { ParticipantRepository, ParticipantSessionRepository } from '@repo/application';
import { MediaController, type MediaSessionContext } from '../../src/media/media-controller.js';

const context: MediaSessionContext = {
  roomId: 'room-1' as never,
  roomSessionId: 'room-session-1' as never,
  participantId: 'participant-1' as never,
  participantSessionId: 'participant-session-1' as never,
  connectionId: 'connection-1' as never,
};
const joinedAt = new Date('2026-01-01T00:00:00Z');

function repos(
  participant = {
    ...createParticipant({
      id: 'participant-1' as never,
      roomId: 'room-1' as never,
      roomSessionId: 'room-session-1' as never,
      userId: 'user-1' as never,
      joinedAt,
    }),
    audioRole: 'SPEAKER' as const,
  },
  session = createParticipantSession({
    id: 'participant-session-1' as never,
    participantId: 'participant-1' as never,
    connectionId: 'connection-1' as never,
    connectedAt: joinedAt,
  })
) {
  return {
    participants: {
      findById: vi.fn().mockResolvedValue(participant),
    } as unknown as ParticipantRepository,
    sessions: {
      findById: vi.fn().mockResolvedValue(session),
    } as unknown as ParticipantSessionRepository,
  };
}

describe('MediaController authorization and media boundary', () => {
  it('requires participant/session repositories', async () => {
    await expect(new MediaController({} as never).getAudioState(context)).rejects.toMatchObject({
      code: 'MEDIA_UNAUTHORIZED',
    });
  });

  it('binds media authorization to the realtime connection id', async () => {
    const session = createParticipantSession({
      id: 'participant-session-1' as never,
      participantId: 'participant-1' as never,
      connectionId: 'other-connection' as never,
      connectedAt: joinedAt,
    });
    const r = repos(undefined, session);
    await expect(
      new MediaController(
        {} as never,
        undefined,
        undefined,
        r.participants,
        r.sessions
      ).getAudioState(context)
    ).rejects.toMatchObject({ code: 'MEDIA_SESSION_INVALID' });
  });

  it('reports durable audio state and transmit eligibility', async () => {
    const r = repos();
    await expect(
      new MediaController(
        {} as never,
        undefined,
        undefined,
        r.participants,
        r.sessions
      ).getAudioState(context)
    ).resolves.toEqual({
      audioRole: 'SPEAKER',
      selfMuted: false,
      moderatorMuted: false,
      canTransmitAudio: true,
    });
  });

  it('blocks send transport while self-muted but allows receive transport', async () => {
    const r = repos({
      ...createParticipant({
        id: 'participant-1' as never,
        roomId: 'room-1' as never,
        roomSessionId: 'room-session-1' as never,
        userId: 'user-1' as never,
        joinedAt,
      }),
      audioRole: 'SPEAKER' as const,
      selfMuted: true,
    } as never);
    const media = {
      createRouter: vi.fn().mockResolvedValue({ routerId: 'r1', rtpCapabilities: { codecs: [] } }),
      createWebRtcTransport: vi.fn().mockResolvedValue({ transportId: 't1' }),
    };
    const c = new MediaController(media as never, undefined, undefined, r.participants, r.sessions);
    await expect(c.createTransport(context, { direction: 'send' })).rejects.toMatchObject({
      code: 'MEDIA_UNAUTHORIZED',
    });
    await expect(c.createTransport(context, { direction: 'recv' })).resolves.toMatchObject({
      transportId: 't1',
    });
  });

  it('forwards connection identity and rejects mismatched producer identity', async () => {
    const r = repos();
    const media = { produceAudio: vi.fn().mockResolvedValue({ producerId: 'p1' }) };
    const c = new MediaController(media as never, undefined, undefined, r.participants, r.sessions);
    await expect(
      c.produceAudio(context, {
        transportId: 't1',
        kind: 'audio',
        rtpParameters: {},
        appData: { participantId: 'different', participantSessionId: 'participant-session-1' },
      })
    ).rejects.toMatchObject({ code: 'MEDIA_IDENTITY_MISMATCH' });
    await c.produceAudio(context, {
      transportId: 't1',
      kind: 'audio',
      rtpParameters: {},
      appData: { participantId: 'participant-1', participantSessionId: 'participant-session-1' },
    });
    expect(media.produceAudio).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'connection-1' })
    );
  });
});
