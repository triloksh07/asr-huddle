import { z } from "zod";
import type { RoomId, UserId } from "@repo/domain";
import type { JoinRoomUseCase } from "@repo/application";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
} from "../types.js";
import { realtimeErrors } from "../errors.js";

const payloadSchema = z.object({
  roomId: z.string().min(1),
});

export class JoinRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = "room.join";

  constructor(private readonly useCase: JoinRoomUseCase) {}

  async handle(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope,
  ): Promise<unknown> {
    const parsed = payloadSchema.parse(envelope.payload);

    if (context.connection.roomId) {
      throw realtimeErrors.invalidState("Connection is already attached to a room.");
    }

    const result = await this.useCase.execute({
      roomId: parsed.roomId as RoomId,
      userId: context.connection.userId as UserId,
    });

    return result;
  }
}
