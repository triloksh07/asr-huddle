import {
  assertRoomSessionActive,
  canRecoverParticipantSession,
  markReconnected,
  markSessionReconnected,
  type ConnectionId,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
  RoomRepository,
  RoomSessionRepository,
} from '../ports.js';

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
}

export class ReconnectRoom {
  constructor(
    private readonly users: import('../ports.js').UserRepository,
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly participants: ParticipantRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(command: ReconnectRoomCommand): Promise<ReconnectRoomResult> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'Authenticated user was not found.');

    const room = await this.rooms.findById(command.roomId);
    if (!room) throw new ApplicationError('NOT_FOUND', 'Room was not found.');

    const roomSession = await this.sessions.findActiveByRoomId(command.roomId);
    if (!roomSession) throw new ApplicationError('ROOM_ENDED', 'The room is not active.');
    assertRoomSessionActive(roomSession);

    const participant = await this.participants.findById(command.participantId);
    if (!participant) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');

    if (
      participant.roomId !== room.id ||
      participant.roomSessionId !== roomSession.id ||
      participant.userId !== user.id
    ) {
      throw new ApplicationError(
        'FORBIDDEN',
        'Participant does not belong to this authenticated room session.'
      );
    }

    if (participant.status !== 'DISCONNECTED') {
      throw new ApplicationError(
        'CONFLICT',
        'Participant is not in a recoverable disconnected state.'
      );
    }

    const session = await this.participantSessions.findById(command.participantSessionId);
    if (!session) throw new ApplicationError('NOT_FOUND', 'Participant session was not found.');

    if (session.participantId !== participant.id) {
      throw new ApplicationError(
        'FORBIDDEN',
        'Participant session does not belong to the participant.'
      );
    }

    if (!canRecoverParticipantSession(session, this.clock.now())) {
      throw new ApplicationError('CONFLICT', 'The participant recovery window has expired.');
    }

    const activeSession = await this.participantSessions.findActiveByParticipantId(participant.id);
    if (activeSession && activeSession.id !== session.id) {
      throw new ApplicationError('CONFLICT', 'Participant already has an active session.');
    }

    const now = this.clock.now();
    const reconnectedParticipant = markReconnected(participant);
    const reconnectedSession = markSessionReconnected(session, command.connectionId, now);

    await this.participants.save(reconnectedParticipant);
    await this.participantSessions.save(reconnectedSession);

    await this.events.publish({
      type: 'participant.reconnected',
      occurredAt: now,
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: session.id,
      userId: participant.userId,
      payload: {
        participantId: participant.id,
        participantSessionId: session.id,
      },
    });

    return {
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: session.id,
      managementRole: reconnectedParticipant.managementRole,
      audioRole: reconnectedParticipant.audioRole,
    };
  }
}
