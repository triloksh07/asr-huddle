import { assertCanModerate, demoteToListener } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, ParticipantRepository } from '../ports.js';
export class DemoteSpeaker {
  constructor(
    private participants: ParticipantRepository,
    private clock: ApplicationClock,
    private events: EventPublisher
  ) {}
  async execute(c: { targetParticipantId: string; moderatorParticipantId: string }) {
    const m = await this.participants.findById(c.moderatorParticipantId);
    const t = await this.participants.findById(c.targetParticipantId);
    if (!m || !t) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    assertCanModerate(m.managementRole);
    if (t.roomId !== m.roomId)
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room.');
    const updated = demoteToListener(t);
    await this.participants.save(updated);
    await this.events.publish({
      type: 'participant.role.changed',
      occurredAt: this.clock.now(),
      roomId: t.roomId,
      roomSessionId: t.roomSessionId,
      participantId: t.id,
      payload: {
        audioRole: updated.audioRole,
        managementRole: updated.managementRole,
        reason: 'MODERATOR_DEMOTION',
      },
    });
    return updated;
  }
}
