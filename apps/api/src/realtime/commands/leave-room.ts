import { z } from "zod";
import type { ParticipantId } from "@repo/domain";
import type { LeaveRoomUseCase } from "@repo/application";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
} from "../types.js";
import { realtimeErrors } from "../errors.js";

const payloadSchema = z.object({});

export class LeaveRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = "room.leave";

  constructor(private readonly useCase: LeaveRoomUseCase) {}

  async handle(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope,
  ): Promise<unknown> {
    payloadSchema.parse(envelope.payload);

    if (!context.connection.participantId) {
      throw realtimeErrors.invalidState("Connection is not attached to a participant.");
    }

    await this.useCase.execute({
      participantId: context.connection.participantId as ParticipantId,
    });

    return {};
  }
}
