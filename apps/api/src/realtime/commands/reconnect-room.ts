import { z } from 'zod';
import type { GetRoomSnapshot, ReconnectRoom } from '@repo/application';
import type { ParticipantId, ParticipantSessionId, RoomId, UserId } from '@repo/domain';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { bindRoomSession } from '../types.js';
import { realtimeErrors } from '../errors.js';

const payloadSchema = z.object({
  roomId: z.string().min(1),
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
});

export class ReconnectRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'room.reconnect';

  constructor(
    private readonly useCase: ReconnectRoom,
    private readonly snapshot: GetRoomSnapshot
  ) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope): Promise<unknown> {
    if (context.connection.roomId !== null) {
      throw realtimeErrors.invalidState('Connection is already attached to a room.');
    }

    const parsed = payloadSchema.parse(envelope.payload);

    const result = await this.useCase.execute({
      roomId: parsed.roomId as RoomId,
      participantId: parsed.participantId as ParticipantId,
      participantSessionId: parsed.participantSessionId as ParticipantSessionId,
      connectionId: context.connection.connectionId,
      userId: context.connection.userId as UserId,
    });

    bindRoomSession(context.connection, {
      roomId: result.roomId as RoomId,
      roomSessionId: result.roomSessionId as any,
      participantId: result.participantId as ParticipantId,
      participantSessionId: result.participantSessionId as ParticipantSessionId,
    });

    const roomSnapshot = await this.snapshot.execute({
      roomId: result.roomId,
    });

    return {
      ...result,
      snapshot: roomSnapshot,
      mediaRecoveryRequired: true,
    };
  }
}
