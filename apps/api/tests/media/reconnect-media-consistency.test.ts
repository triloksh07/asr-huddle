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

function controller(participantOverrides: Record<string, unknown> = {}) {
  const participant = {
    ...createParticipant({
      id: 'participant-1' as never,
      roomId: 'room-1' as never,
      roomSessionId: 'room-session-1' as never,
      userId: 'user-1' as never,
      joinedAt,
    }),
    audioRole: 'SPEAKER' as const,
    ...participantOverrides,
  } as never;
  const session = createParticipantSession({
    id: 'participant-session-1' as never,
    participantId: 'participant-1' as never,
    connectionId: 'connection-1' as never,
    connectedAt: joinedAt,
  });
  const participants = {
    findById: vi.fn().mockResolvedValue(participant),
  } as unknown as ParticipantRepository;
  const sessions = {
    findById: vi.fn().mockResolvedValue(session),
  } as unknown as ParticipantSessionRepository;
  const media = {
    createRouter: vi.fn().mockResolvedValue({ routerId: 'r1', rtpCapabilities: { codecs: [] } }),
    createWebRtcTransport: vi.fn().mockResolvedValue({ transportId: 't1' }),
  };
  return {
    controller: new MediaController(media as never, undefined, undefined, participants, sessions),
    media,
  };
}

describe('media authorization across reconnect state', () => {
  it('allows an unchanged speaker to create a send transport', async () => {
    const { controller: c } = controller();
    await expect(c.createTransport(context, { direction: 'send' })).resolves.toMatchObject({
      transportId: 't1',
    });
  });

  it('rejects a self-muted speaker from creating a send transport', async () => {
    const { controller: c } = controller({ selfMuted: true });
    await expect(c.createTransport(context, { direction: 'send' })).rejects.toMatchObject({
      code: 'MEDIA_UNAUTHORIZED',
    });
  });

  it('rejects a moderator-muted speaker from creating a send transport', async () => {
    const { controller: c } = controller({ moderatorMuted: true });
    await expect(c.createTransport(context, { direction: 'send' })).rejects.toMatchObject({
      code: 'MEDIA_UNAUTHORIZED',
    });
  });

  it('rejects a listener from creating a send transport', async () => {
    const { controller: c } = controller({ audioRole: 'LISTENER' });
    await expect(c.createTransport(context, { direction: 'send' })).rejects.toMatchObject({
      code: 'MEDIA_UNAUTHORIZED',
    });
  });
});
