import { assertCanModerateTarget, assertRoomSessionActive, setModeratorMuted } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
  RoomSessionRepository,
} from '../ports.js';

export interface ParticipantMediaControl {
  revokeAudioProduction(context: {
    roomId: string;
    roomSessionId: string;
    participantId: string;
    participantSessionId: string;
  }): Promise<void>;
}

export class MuteParticipant {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly media?: ParticipantMediaControl
  ) {}

  async execute(command: { moderatorParticipantId: string; targetParticipantId: string }) {
    const moderator = await this.participants.findById(command.moderatorParticipantId);
    const target = await this.participants.findById(command.targetParticipantId);
    if (!moderator || !target)
      throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    if (moderator.roomSessionId !== target.roomSessionId)
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room session.');
    const session = await this.sessions.findActiveByRoomId(target.roomId);
    if (!session || session.id !== target.roomSessionId)
      throw new ApplicationError('ROOM_SESSION_ENDED', 'The room session is no longer active.');
    assertRoomSessionActive(session);
    assertCanModerateTarget(moderator, target);
    if (target.audioRole !== 'SPEAKER')
      throw new ApplicationError('INVALID_TARGET', 'Only speakers can be moderator-muted.');

    const updated = setModeratorMuted(target, true);
    await this.participants.save(updated);

    const activeSession = await this.participantSessions.findActiveByParticipantId(target.id);
    if (this.media && activeSession) {
      await this.media.revokeAudioProduction({
        roomId: target.roomId,
        roomSessionId: target.roomSessionId,
        participantId: target.id,
        participantSessionId: activeSession.id,
      });
    }

    const now = this.clock.now();
    await this.events.publish({
      type: 'participant.moderation.mute.changed',
      occurredAt: now,
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: { moderatorMuted: true, byParticipantId: moderator.id },
    });
    return updated;
  }
}
