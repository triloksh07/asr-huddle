import { REACTION_TYPES, type ReactionType } from '@repo/domain';
import type { ApplicationClock, EventPublisher, ParticipantRepository } from '../ports.js';
export interface SendReactionCommand {
  readonly participantId: string;
  readonly type: ReactionType;
}
export class SendReaction {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}
  async execute(command: SendReactionCommand): Promise<void> {
    const participant = await this.participants.findById(command.participantId);
    if (!participant || participant.status !== 'CONNECTED')
      throw new Error('PARTICIPANT_NOT_CONNECTED');
    if (!REACTION_TYPES.includes(command.type)) throw new Error('INVALID_REACTION');
    await this.events.publish({
      type: 'room.reaction.received',
      occurredAt: this.clock.now(),
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      userId: participant.userId,
      payload: { type: command.type },
    });
  }
}
