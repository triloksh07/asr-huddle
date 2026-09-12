import { markLeft, markSessionDisconnected, markSessionIntentionalLeave } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, Transaction } from '../ports.js';
import type { HostDelegator } from './types.js';
export interface LeaveRoomCommand {
  readonly participantId: string;
  readonly participantSessionId: string;
}
export class LeaveRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly hostDelegator?: HostDelegator
  ) {}
  async execute(command: LeaveRoomCommand): Promise<void> {
    const result = await this.transaction.run(async ({ participants, participantSessions }) => {
      const participant = await participants.findById(command.participantId);
      if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
      const session = await participantSessions.findById(command.participantSessionId);
      if (!session) throw new ApplicationError('NOT_FOUND', 'Participant session was not found.');
      if (session.participantId !== participant.id)
        throw new ApplicationError(
          'FORBIDDEN',
          'Participant session does not belong to the participant.'
        );
      const now = this.clock.now();
      await participants.save(markLeft(participant, now));
      await participantSessions.save(
        markSessionIntentionalLeave(markSessionDisconnected(session, now, null))
      );
      return {
        roomId: participant.roomId,
        roomSessionId: participant.roomSessionId,
        participantId: participant.id,
        participantSessionId: session.id,
        userId: participant.userId,
        wasHost: participant.managementRole === 'HOST',
      };
    });
    await this.events.publish({
      type: 'participant.left',
      occurredAt: this.clock.now(),
      roomId: result.roomId,
      roomSessionId: result.roomSessionId,
      participantId: result.participantId,
      participantSessionId: result.participantSessionId,
      userId: result.userId,
      payload: {
        participantId: result.participantId,
        participantSessionId: result.participantSessionId,
      },
    });
    if (result.wasHost)
      await this.hostDelegator?.execute({
        roomSessionId: result.roomSessionId,
        previousHostParticipantId: result.participantId,
      });
  }
}
