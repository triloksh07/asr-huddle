import {
  assertRoomSessionActive,
  canRecoverParticipantSession,
  markReconnected,
  type ConnectionId,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, Transaction } from '../ports.js';

export interface ReconnectRoomCommand {
  readonly roomId: string;
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly connectionId: ConnectionId;
  readonly userId: string;
}

export interface ReconnectRoomResult {
  readonly roomId: string;
  readonly roomSessionId: string;
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly managementRole: 'HOST' | 'CO_HOST' | 'NONE';
  readonly audioRole: 'SPEAKER' | 'LISTENER';
  readonly selfMuted: boolean;
  readonly moderatorMuted: boolean;
}

export class ReconnectRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(command: ReconnectRoomCommand): Promise<ReconnectRoomResult> {
    const result = await this.transaction.run(
      async ({ users, rooms, roomSessions, participants, participantSessions }) => {
        const user = await users.findById(command.userId);
        if (!user)
          throw new ApplicationError('UNAUTHENTICATED', 'Authenticated user was not found.');

        const room = await rooms.findById(command.roomId);
        if (!room) throw new ApplicationError('NOT_FOUND', 'Room was not found.');

        const roomSession = await roomSessions.findActiveByRoomId(command.roomId);
        if (!roomSession) throw new ApplicationError('ROOM_ENDED', 'The room is not active.');
        assertRoomSessionActive(roomSession);

        const participant = await participants.findById(command.participantId);
        if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');

        if (
          participant.roomId !== room.id ||
          participant.roomSessionId !== roomSession.id ||
          participant.userId !== user.id
        )
          throw new ApplicationError(
            'FORBIDDEN',
            'Participant does not belong to this authenticated room session.'
          );

        if (participant.status !== 'DISCONNECTED')
          throw new ApplicationError(
            'CONFLICT',
            'Participant is not in a recoverable disconnected state.'
          );

        const session = await participantSessions.findById(command.participantSessionId);
        if (!session) throw new ApplicationError('NOT_FOUND', 'Participant session was not found.');

        if (session.participantId !== participant.id)
          throw new ApplicationError(
            'FORBIDDEN',
            'Participant session does not belong to the participant.'
          );

        if (session.connectionId === null)
          throw new ApplicationError(
            'CONFLICT',
            'This participant session no longer has a recoverable connection binding.'
          );

        const now = this.clock.now();

        if (!canRecoverParticipantSession(session, now))
          throw new ApplicationError('CONFLICT', 'The participant recovery window has expired.');

        const activeSession = await participantSessions.findActiveByParticipantId(participant.id);
        if (activeSession && activeSession.id !== session.id)
          throw new ApplicationError('CONFLICT', 'Participant already has another active session.');

        // Compare-and-claim the recoverable session in the same database transaction.
        // A concurrent reconnect using the same stale session snapshot will affect
        // zero rows and therefore cannot also become the active connection.
        const claimedSession = await participantSessions.claimReconnect(
          session.id,
          session.connectionId,
          command.connectionId,
          now
        );

        if (!claimedSession)
          throw new ApplicationError(
            'CONFLICT',
            'The participant session was already reclaimed by another connection.'
          );

        const updatedParticipant = markReconnected(participant);
        await participants.save(updatedParticipant);

        return {
          roomId: participant.roomId,
          roomSessionId: participant.roomSessionId,
          participantId: participant.id,
          participantSessionId: claimedSession.id,
          userId: participant.userId,
          managementRole: updatedParticipant.managementRole,
          audioRole: updatedParticipant.audioRole,
          selfMuted: updatedParticipant.selfMuted,
          moderatorMuted: updatedParticipant.moderatorMuted,
        };
      }
    );

    await this.events.publish({
      type: 'participant.reconnected',
      occurredAt: this.clock.now(),
      roomId: result.roomId,
      roomSessionId: result.roomSessionId,
      participantId: result.participantId,
      participantSessionId: result.participantSessionId,
      userId: result.userId,
      payload: { ...result, mediaRecoveryRequired: true },
    });

    return result;
  }
}
