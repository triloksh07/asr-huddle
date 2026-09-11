import { assertCanModerateTarget, demoteFromCoHost } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, ParticipantRepository } from '../ports.js';

export class DemoteCoHost {
  constructor(
    private readonly participants: ParticipantRepository,
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
    assertCanModerateTarget(moderator, target);
    if (target.managementRole !== 'CO_HOST')
      throw new ApplicationError('INVALID_TARGET', 'Target is not a co-host.');
    const updated = demoteFromCoHost(target);
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
        reason: 'CO_HOST_DEMOTION',
        changedByParticipantId: moderator.id,
      },
    });
    return updated;
  }
}
