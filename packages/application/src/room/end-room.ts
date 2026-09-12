import {
  endRoom,
  endRoomSession,
  markRoomEnded,
  markSessionDisconnected,
  markSessionIntentionalLeave,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, Transaction } from '../ports.js';
export interface EndRoomCommand {
  readonly roomId: string;
  readonly reason?: 'HOST_ENDED' | 'EXPIRY' | 'EMPTY';
}
export class EndRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}
  async execute(command: EndRoomCommand): Promise<void> {
    const endedAt = this.clock.now();
    const result = await this.transaction.run(
      async ({ rooms, roomSessions, participants, participantSessions }) => {
        const room = await rooms.findById(command.roomId);
        if (!room) throw new ApplicationError('NOT_FOUND', 'Room was not found.');
        const session = await roomSessions.findActiveByRoomId(command.roomId);
        if (!session) return { changed: false as const };
        await rooms.save(endRoom(room, endedAt));
        await roomSessions.save(endRoomSession(session, endedAt));
        const roomParticipants = await participants.findByRoomSession(session.id);
        for (const participant of roomParticipants) {
          await participants.save(markRoomEnded(participant, endedAt));
          for (const participantSession of await participantSessions.findByParticipantId(
            participant.id
          )) {
            const disconnected = markSessionDisconnected(participantSession, endedAt, null);
            await participantSessions.save(markSessionIntentionalLeave(disconnected));
          }
        }
        return { changed: true as const, roomSessionId: session.id };
      }
    );
    if (!result.changed) return;
    await this.events.publish({
      type: 'room.ended',
      occurredAt: endedAt,
      roomId: command.roomId,
      roomSessionId: result.roomSessionId,
      payload: { reason: command.reason ?? 'HOST_ENDED' },
    });
  }
}
