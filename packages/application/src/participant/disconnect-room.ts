import { markDisconnected, markSessionDisconnected } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, Transaction } from '../ports.js';
import type { HostDelegator } from './types.js';
export interface DisconnectRoomCommand {
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly recoverableForMs: number;
}
export class DisconnectRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly hostDelegator?: HostDelegator
  ) {}
  async execute(command: DisconnectRoomCommand): Promise<void> {
    const result = await this.transaction.run(async ({ participants, participantSessions }) => {
      const participant = await participants.findById(command.participantId);
      if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
      const session = await participantSessions.findById(command.participantSessionId);
      if (!session) throw new ApplicationError('NOT_FOUND', 'Participant session was not found.');
      if (session.participantId !== participant.id)
        throw new ApplicationError(
          'INVALID_STATE',
          'Participant session does not belong to the participant.'
        );
      const now = this.clock.now();
      const recoverableUntil = new Date(now.getTime() + command.recoverableForMs);
      await participants.save(markDisconnected(participant, now));
      await participantSessions.save(markSessionDisconnected(session, now, recoverableUntil));
      return {
        roomId: participant.roomId,
        roomSessionId: participant.roomSessionId,
        participantId: participant.id,
        participantSessionId: session.id,
        userId: participant.userId,
        wasHost: participant.managementRole === 'HOST',
        recoverableUntil,
      };
    });
    await this.events.publish({
      type: 'participant.disconnected',
      occurredAt: this.clock.now(),
      roomId: result.roomId,
      roomSessionId: result.roomSessionId,
      participantId: result.participantId,
      participantSessionId: result.participantSessionId,
      userId: result.userId,
      payload: {
        participantId: result.participantId,
        participantSessionId: result.participantSessionId,
        recoverableUntil: result.recoverableUntil.toISOString(),
      },
    });
    if (result.wasHost)
      await this.hostDelegator?.execute({
        roomSessionId: result.roomSessionId,
        previousHostParticipantId: result.participantId,
      });
  }
}
