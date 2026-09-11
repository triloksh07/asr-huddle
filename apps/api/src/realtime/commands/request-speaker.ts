import { z } from "zod";
import type { ParticipantId, RoomId, UserId } from "@repo/domain";
import type { RequestSpeaker } from "@repo/application";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
} from "../types.js";
import { realtimeErrors } from "../errors.js";

const payloadSchema = z.object({
  roomId: z.string().min(1),
});

export class RequestSpeakerRealtimeCommand implements RealtimeCommandHandler {
  readonly type = "speaker.request";

  constructor(private readonly useCase: RequestSpeaker) {}

  async handle(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope,
  ): Promise<unknown> {
    const parsed = payloadSchema.parse(envelope.payload);

    if (!context.connection.participantId) {
      throw realtimeErrors.invalidState("Connection is not attached to a participant.");
    }

    return this.useCase.execute({
      // roomId: parsed.roomId as RoomId,
      participantId: context.connection.participantId as ParticipantId,
      // userId: context.connection.userId as UserId,
    });
  }
}
