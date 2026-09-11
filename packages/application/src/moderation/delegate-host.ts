import { promoteToCoHost } from '@repo/domain';
import type { ApplicationClock, EventPublisher, ParticipantRepository } from '../ports.js';

export class DelegateHost {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(command: { roomSessionId: string; previousHostParticipantId: string }) {
    const all = await this.participants.findByRoomSession(command.roomSessionId);
    const hasActiveCoHost = all.some(
      p => p.status === 'CONNECTED' && p.managementRole === 'CO_HOST'
    );
    if (hasActiveCoHost) return null;

    const eligible = all.filter(
      p =>
        p.status === 'CONNECTED' &&
        p.id !== command.previousHostParticipantId &&
        p.managementRole === 'NONE'
    );
    const speakers = eligible.filter(p => p.audioRole === 'SPEAKER');
    const candidate = [...(speakers.length ? speakers : eligible)].sort(
      (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime()
    )[0];
    if (!candidate) return null;

    const updated = promoteToCoHost(candidate);
    await this.participants.save(updated);
    await this.events.publish({
      type: 'participant.role.changed',
      occurredAt: this.clock.now(),
      roomId: candidate.roomId,
      roomSessionId: candidate.roomSessionId,
      participantId: candidate.id,
      payload: {
        managementRole: 'CO_HOST',
        audioRole: 'SPEAKER',
        reason: 'HOST_DELEGATION',
        previousHostParticipantId: command.previousHostParticipantId,
      },
    });
    return updated;
  }
}
