import { assertCanModerateTarget, assertRoomSessionActive, setModeratorMuted } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  RoomSessionRepository,
} from '../ports.js';

export class UnmuteParticipant {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(command: { moderatorParticipantId: string; targetParticipantId: string }) {
    const moderator = await this.participants.findById(command.moderatorParticipantId);
    const target = await this.participants.findById(command.targetParticipantId);
    if (!moderator || !target)
      throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    if (moderator.roomSessionId !== target.roomSessionId) {
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room session.');
    }
    const session = await this.sessions.findActiveByRoomId(target.roomId);
    if (!session)
      throw new ApplicationError('ROOM_SESSION_ENDED', 'The room session is no longer active.');
    assertRoomSessionActive(session);
    assertCanModerateTarget(moderator, target);

    const updated = setModeratorMuted(target, false);
    await this.participants.save(updated);
    await this.events.publish({
      type: 'participant.moderation.mute.changed',
      occurredAt: this.clock.now(),
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: { moderatorMuted: false, byParticipantId: moderator.id },
    });
    return updated;
  }
}
