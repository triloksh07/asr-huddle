import { setSelfMuted } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, ParticipantRepository } from '../ports.js';

export class SetSelfMute {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(command: { participantId: string; muted: boolean }) {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    const updated = setSelfMuted(participant, command.muted);
    await this.participants.save(updated);
    await this.events.publish({
      type: 'participant.self_mute.changed',
      occurredAt: this.clock.now(),
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      payload: { selfMuted: updated.selfMuted, moderatorMuted: updated.moderatorMuted },
    });
    return updated;
  }
}
