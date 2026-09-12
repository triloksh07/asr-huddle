import {
  assertCanAddListener,
  assertRoomSessionActive,
  createHostParticipant,
  createParticipant,
  createParticipantSession,
  type ConnectionId,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, IdGenerator, Transaction } from '../ports.js';
export interface JoinRoomCommand {
  readonly roomId: string;
  readonly userId: string;
  readonly connectionId: ConnectionId;
}
export interface JoinRoomResult {
  readonly roomId: string;
  readonly roomSessionId: string;
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly managementRole: 'HOST' | 'CO_HOST' | 'NONE';
  readonly audioRole: 'SPEAKER' | 'LISTENER';
}
export class JoinRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}
  async execute(command: JoinRoomCommand): Promise<JoinRoomResult> {
    const result = await this.transaction.run(
      async ({ users, rooms, roomSessions, participants, participantSessions }) => {
        const user = await users.findById(command.userId);
        if (!user)
          throw new ApplicationError('UNAUTHENTICATED', 'Authenticated user was not found.');
        const room = await rooms.findById(command.roomId);
        if (!room) throw new ApplicationError('NOT_FOUND', 'Room was not found.');
        const session = await roomSessions.findActiveByRoomId(command.roomId);
        if (!session) throw new ApplicationError('ROOM_ENDED', 'The room is not active.');
        assertRoomSessionActive(session);
        const existing = await participants.findByRoomSession(session.id);
        const existingUser = existing.find(p => p.userId === user.id);
        if (existingUser?.status === 'CONNECTED') {
          const active = await participantSessions.findActiveByParticipantId(existingUser.id);
          if (active)
            throw new ApplicationError(
              'CONFLICT',
              'This user already has an active session in the room.'
            );
        }
        const listenerCount = existing.filter(
          p => p.status === 'CONNECTED' && p.audioRole === 'LISTENER'
        ).length;
        const speakerCount = existing.filter(
          p => p.status === 'CONNECTED' && p.audioRole === 'SPEAKER'
        ).length;
        const coHostCount = existing.filter(
          p => p.status === 'CONNECTED' && p.managementRole === 'CO_HOST'
        ).length;
        assertCanAddListener({
          listeners: listenerCount,
          speakers: speakerCount,
          coHosts: coHostCount,
        });
        const now = this.clock.now();
        const isFirstHostParticipation =
          room.hostUserId === user.id && !existing.some(p => p.userId === user.id);
        const participant = isFirstHostParticipation
          ? createHostParticipant({
              id: this.ids.next() as ReturnType<typeof createHostParticipant>['id'],
              roomId: room.id,
              roomSessionId: session.id,
              userId: user.id as ReturnType<typeof createHostParticipant>['userId'],
              joinedAt: now,
            })
          : createParticipant({
              id: this.ids.next() as ReturnType<typeof createParticipant>['id'],
              roomId: room.id,
              roomSessionId: session.id,
              userId: user.id as ReturnType<typeof createParticipant>['userId'],
              joinedAt: now,
            });
        const participantSession = createParticipantSession({
          id: this.ids.next() as ReturnType<typeof createParticipantSession>['id'],
          participantId: participant.id,
          connectionId: command.connectionId,
          connectedAt: now,
        });
        await participants.save(participant);
        await participantSessions.save(participantSession);
        return {
          roomId: participant.roomId,
          roomSessionId: participant.roomSessionId,
          participantId: participant.id,
          participantSessionId: participantSession.id,
          managementRole: participant.managementRole,
          audioRole: participant.audioRole,
        };
      }
    );
    await this.events.publish({
      type: 'participant.joined',
      occurredAt: this.clock.now(),
      roomId: result.roomId,
      roomSessionId: result.roomSessionId,
      participantId: result.participantId,
      participantSessionId: result.participantSessionId,
      userId: command.userId,
      payload: result,
    });
    return result;
  }
}
