import type { EndRoom } from "@repo/application";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
} from "../types.js";
import { realtimeErrors } from "../errors.js";

export class EndRoomRealtimeCommand implements RealtimeCommandHandler {
  readonly type = "room.end";

  constructor(private readonly useCase: EndRoom) {}

  async handle(
    context: RealtimeCommandContext,
    _envelope: RealtimeEnvelope,
  ): Promise<unknown> {
    if (!context.connection.roomId) {
      throw realtimeErrors.invalidState("Connection is not attached to a room.");
    }

    if (context.connection.participantId === null) {
      throw realtimeErrors.invalidState("Connection has no participant.");
    }

    // Server-authoritative role check. The room's host identity is verified
    // by loading participant state inside the application boundary in a later
    // moderation slice; this command intentionally does not trust the client.
    throw new Error(
      "room.end authorization is not yet implemented; command is intentionally fail-closed.",
    );
  }
}
