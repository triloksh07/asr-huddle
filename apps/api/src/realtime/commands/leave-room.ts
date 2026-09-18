import { z } from 'zod';
import type { ParticipantId, ParticipantSessionId } from '@repo/domain';
import type { LeaveRoom } from '@repo/application';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { realtimeErrors } from '../errors.js';
import { clearRoomSessionBinding } from '../types.js';
import type { MediaController } from '../../media/media-controller.js';

const payloadSchema = z.object({});

export class LeaveRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'room.leave';

  constructor(
    private readonly useCase: LeaveRoom,
    private readonly media: MediaController
  ) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope): Promise<unknown> {
    payloadSchema.parse(envelope.payload);

    // const { participantId, participantSessionId } = context.connection;
    const { roomId, roomSessionId, participantId, participantSessionId, connectionId } =
      context.connection;

    if (!participantId || !participantSessionId) {
      throw realtimeErrors.invalidState(
        'Connection is not attached to an active participant session.'
      );
    }

    await this.useCase.execute({
      participantId: participantId as ParticipantId,
      participantSessionId: participantSessionId as ParticipantSessionId,
    });

    await this.media.closeParticipant({
      roomId: roomId!,
      roomSessionId: roomSessionId!,
      participantId: participantId as never,
      participantSessionId: participantSessionId as never,
      connectionId,
    });

    clearRoomSessionBinding(context.connection);
    return {};
  }
}
