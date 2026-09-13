import { setSelfMuted } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
} from '../ports.js';

export interface SelfMuteMediaControl {
  revokeAudioProduction(context: {
    roomId: string;
    roomSessionId: string;
    participantId: string;
    participantSessionId: string;
  }): Promise<void>;
}

export class SetSelfMute {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly participantSessions?: ParticipantSessionRepository,
    private readonly media?: SelfMuteMediaControl
  ) {}

  async execute(command: { participantId: string; muted: boolean }) {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    const updated = setSelfMuted(participant, command.muted);
    await this.participants.save(updated);

    if (command.muted && this.media && this.participantSessions) {
      const activeSession = await this.participantSessions.findActiveByParticipantId(
        participant.id
      );
      if (activeSession) {
        await this.media.revokeAudioProduction({
          roomId: participant.roomId,
          roomSessionId: participant.roomSessionId,
          participantId: participant.id,
          participantSessionId: activeSession.id,
        });
      }
    }

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
