import {
  assertCanModerateTarget,
  assertCanPromoteToCoHost,
  assertRoomSessionActive,
  promoteToCoHost,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  RoomSessionRepository,
} from '../ports.js';

export class PromoteCoHost {
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
    if (moderator.roomSessionId !== target.roomSessionId)
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room session.');
    if (moderator.managementRole !== 'HOST')
      throw new ApplicationError('FORBIDDEN', 'Only the host can manage co-hosts.');
    const session = await this.sessions.findActiveByRoomId(target.roomId);
    if (!session)
      throw new ApplicationError('ROOM_SESSION_ENDED', 'The room session is no longer active.');
    assertRoomSessionActive(session);
    assertCanModerateTarget(moderator, target);
    if (target.audioRole !== 'SPEAKER')
      throw new ApplicationError('INVALID_TARGET', 'A co-host must already be a speaker.');

    const counts = (await this.participants.findByRoomSession(target.roomSessionId)).reduce(
      (acc, p) => {
        if (p.managementRole === 'CO_HOST') acc.coHosts += 1;
        if (p.audioRole === 'SPEAKER') acc.speakers += 1;
        if (p.audioRole === 'LISTENER') acc.listeners += 1;
        return acc;
      },
      { coHosts: 0, speakers: 0, listeners: 0 }
    );
    assertCanPromoteToCoHost(counts);
    const updated = promoteToCoHost(target);
    await this.participants.save(updated);
    await this.events.publish({
      type: 'participant.role.changed',
      occurredAt: this.clock.now(),
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: {
        managementRole: updated.managementRole,
        audioRole: updated.audioRole,
        reason: 'CO_HOST_PROMOTION',
        changedByParticipantId: moderator.id,
      },
    });
    return updated;
  }
}
