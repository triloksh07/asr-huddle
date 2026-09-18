import { assertCanModerate, demoteToListener } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
} from '../ports.js';

export interface ParticipantAudioRevocation {
  revokeAudioProduction(context: {
    roomId: string;
    roomSessionId: string;
    participantId: string;
    participantSessionId: string;
    connectionId: string;
  }): Promise<void>;
}

export class DemoteSpeaker {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly participantSessions?: ParticipantSessionRepository,
    private readonly media?: ParticipantAudioRevocation
  ) {}

  async execute(c: { targetParticipantId: string; moderatorParticipantId: string }) {
    const m = await this.participants.findById(c.moderatorParticipantId);
    const t = await this.participants.findById(c.targetParticipantId);
    if (!m || !t) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    assertCanModerate(m.managementRole);
    if (t.roomId !== m.roomId)
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room.');

    const activeSession = await this.participantSessions?.findActiveByParticipantId(t.id);
    if (this.media && activeSession) {
      // Demotion removes transmit authorization, so revoke the live producer before changing
      // durable role state. If media cleanup fails, the role remains unchanged.
      await this.media.revokeAudioProduction({
        roomId: t.roomId,
        roomSessionId: t.roomSessionId,
        participantId: t.id,
        participantSessionId: activeSession.id,
        connectionId: activeSession.connectionId,
      });
    }

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
