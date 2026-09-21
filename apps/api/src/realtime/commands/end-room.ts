import type { RoomControl } from '@repo/application';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { realtimeErrors } from '../errors.js';

export class EndRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'room.end';

  constructor(private readonly rooms: RoomControl) {}

  async handle(context: RealtimeCommandContext, _envelope: RealtimeEnvelope): Promise<unknown> {
    if (!context.connection.roomId)
      throw realtimeErrors.invalidState('Connection is not attached to a room.');

    if (context.connection.participantId === null)
      throw realtimeErrors.invalidState('Connection has no participant.');
    return this.rooms.endAsHost(context.connection.roomId, context.connection.userId);
  }
}
