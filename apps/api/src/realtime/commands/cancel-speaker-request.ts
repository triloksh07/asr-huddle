import { z } from "zod";
import type { ParticipantId, RoomId } from "@repo/domain";
import type { CancelSpeakerRequestUseCase } from "@repo/application";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
} from "../types.js";
import { realtimeErrors } from "../errors.js";

const payloadSchema = z.object({
  roomId: z.string().min(1),
  requestId: z.string().min(1),
});

export class CancelSpeakerRequestRealtimeCommand implements RealtimeCommandHandler {
  readonly type = "speaker.request.cancel";

  constructor(private readonly useCase: CancelSpeakerRequestUseCase) {}

  async handle(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope,
  ): Promise<unknown> {
    const parsed = payloadSchema.parse(envelope.payload);

    if (!context.connection.participantId) {
      throw realtimeErrors.invalidState("Connection is not attached to a participant.");
    }

    await this.useCase.execute({
      roomId: parsed.roomId as RoomId,
      requestId: parsed.requestId as never,
      participantId: context.connection.participantId as ParticipantId,
    });

    return {};
  }
}
