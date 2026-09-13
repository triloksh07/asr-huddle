import { canRaiseHand } from '@repo/domain';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  RaisedHandStore,
} from '../ports.js';
export interface SetHandRaisedCommand {
  readonly participantId: string;
  readonly raised: boolean;
}
export class SetHandRaised {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly raisedHands: RaisedHandStore,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}
  async execute(command: SetHandRaisedCommand): Promise<{ handRaised: boolean }> {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
    if (!canRaiseHand(participant)) throw new Error('PARTICIPANT_NOT_SPEAKER');
    await this.raisedHands.set(participant.roomSessionId, participant.id, command.raised);
    await this.events.publish({
      type: command.raised ? 'participant.hand.raised' : 'participant.hand.lowered',
      occurredAt: this.clock.now(),
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      userId: participant.userId,
      payload: { handRaised: command.raised },
    });
    return { handRaised: command.raised };
  }
}
