import { describe, expect, it, vi } from 'vitest';
import { SetSelfMute } from '@repo/application';

function participant() {
  return {
    id: 'participant-1',
    roomId: 'room-1',
    roomSessionId: 'room-session-1',
    userId: 'user-1',
    managementRole: 'NONE',
    audioRole: 'SPEAKER',
    status: 'CONNECTED',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    disconnectedAt: null,
    leftAt: null,
    removedAt: null,
    selfMuted: false,
    moderatorMuted: false,
  };
}

function activeSession() {
  return {
    id: 'participant-session-1',
    participantId: 'participant-1',
    connectionId: 'connection-1',
    connectedAt: new Date('2026-01-01T00:00:00.000Z'),
    disconnectedAt: null,
    intentionalLeave: false,
    recoverableUntil: null,
  };
}

describe('SetSelfMute', () => {
  it('passes the exact active connection identity to media revocation before persisting mute', async () => {
    const current = participant();
    const participants = {
      findById: vi.fn().mockResolvedValue(current),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const sessions = {
      findActiveByParticipantId: vi.fn().mockResolvedValue(activeSession()),
    };
    const media = { revokeAudioProduction: vi.fn().mockResolvedValue(undefined) };
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const clock = { now: vi.fn().mockReturnValue(new Date('2026-01-01T00:01:00.000Z')) };

    const useCase = new SetSelfMute(
      participants as never,
      clock,
      events as never,
      sessions as never,
      media
    );

    const result = await useCase.execute({ participantId: 'participant-1', muted: true });

    expect(media.revokeAudioProduction).toHaveBeenCalledWith({
      roomId: 'room-1',
      roomSessionId: 'room-session-1',
      participantId: 'participant-1',
      participantSessionId: 'participant-session-1',
      connectionId: 'connection-1',
    });
    expect(participants.save).toHaveBeenCalledWith(expect.objectContaining({ selfMuted: true }));
    expect(result.selfMuted).toBe(true);
  });

  it('does not revoke media when unmuting', async () => {
    const current = { ...participant(), selfMuted: true };
    const participants = {
      findById: vi.fn().mockResolvedValue(current),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const sessions = { findActiveByParticipantId: vi.fn() };
    const media = { revokeAudioProduction: vi.fn() };
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const clock = { now: vi.fn().mockReturnValue(new Date()) };

    const useCase = new SetSelfMute(
      participants as never,
      clock,
      events as never,
      sessions as never,
      media
    );

    const result = await useCase.execute({ participantId: 'participant-1', muted: false });

    expect(media.revokeAudioProduction).not.toHaveBeenCalled();
    expect(sessions.findActiveByParticipantId).not.toHaveBeenCalled();
    expect(result.selfMuted).toBe(false);
  });

  it('does not persist muted state when the media revoke fails', async () => {
    const participants = {
      findById: vi.fn().mockResolvedValue(participant()),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const sessions = { findActiveByParticipantId: vi.fn().mockResolvedValue(activeSession()) };
    const media = {
      revokeAudioProduction: vi.fn().mockRejectedValue(new Error('SFU unavailable')),
    };
    const events = { publish: vi.fn() };
    const clock = { now: vi.fn().mockReturnValue(new Date()) };

    const useCase = new SetSelfMute(
      participants as never,
      clock,
      events as never,
      sessions as never,
      media
    );

    await expect(useCase.execute({ participantId: 'participant-1', muted: true })).rejects.toThrow(
      'SFU unavailable'
    );
    expect(participants.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
