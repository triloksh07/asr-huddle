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

function participant(overrides: Partial<ReturnType<typeof createParticipant>> = {}) {
  return {
    ...createParticipant({
      id: 'participant-1' as never,
      roomId: 'room-1' as never,
      roomSessionId: 'room-session-1' as never,
      userId: 'user-1' as never,
      joinedAt,
    }),
    audioRole: 'SPEAKER' as const,
    ...overrides,
  };
}
function repos(
  p = participant(),
  session = createParticipantSession({
    id: 'participant-session-1' as never,
    participantId: 'participant-1' as never,
    connectionId: 'connection-1' as never,
    connectedAt: joinedAt,
  })
) {
  return {
    participants: { findById: vi.fn().mockResolvedValue(p) } as unknown as ParticipantRepository,
    sessions: {
      findById: vi.fn().mockResolvedValue(session),
    } as unknown as ParticipantSessionRepository,
  };
}

describe('G5.6 media authorization consistency', () => {
  it.each([
    ['speaker', participant(), true],
    ['self-muted speaker', participant({ selfMuted: true }), false],
    ['moderator-muted speaker', participant({ moderatorMuted: true }), false],
    ['listener', participant({ audioRole: 'LISTENER' }), false],
  ])('%s has expected transmit authorization', async (_name, p, expected) => {
    const r = repos(p);
    const c = new MediaController({} as never, undefined, undefined, r.participants, r.sessions);
    await expect(c.getAudioState(context)).resolves.toMatchObject({ canTransmitAudio: expected });
  });

  it('rejects send transport while self-muted but still permits receive transport', async () => {
    const r = repos(participant({ selfMuted: true }));
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
});
