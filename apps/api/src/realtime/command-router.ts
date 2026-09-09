import { z } from "zod";
import { realtimeErrors } from "./errors.js";
import type {
  RealtimeCommandContext,
  RealtimeCommandHandler,
  RealtimeEnvelope,
  RealtimeResponse,
} from "./types.js";

const envelopeSchema = z.object({
  requestId: z.string().min(1).max(128),
  type: z.string().min(1).max(128),
  payload: z.unknown(),
});

export class CommandRouter {
  private readonly handlers = new Map<string, RealtimeCommandHandler>();

  register(handler: RealtimeCommandHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Realtime command already registered: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
  }

  async dispatch(
    context: RealtimeCommandContext,
    raw: unknown,
  ): Promise<RealtimeResponse> {
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        requestId: "unknown",
        type: "error",
        ok: false,
        error: {
          code: "INVALID_MESSAGE",
          message: realtimeErrors.invalidMessage().message,
        },
      };
    }

    const envelope = parsed.data as RealtimeEnvelope;
    const handler = this.handlers.get(envelope.type);

    if (!handler) {
      return {
        requestId: envelope.requestId,
        type: "error",
        ok: false,
        error: {
          code: "UNSUPPORTED_COMMAND",
          message: realtimeErrors.unsupportedCommand(envelope.type).message,
        },
      };
    }

    try {
      const payload = await handler.handle(context, envelope);
      return {
        requestId: envelope.requestId,
        type: `${envelope.type}.result`,
        ok: true,
        payload,
      };
    } catch (error) {
      const normalized =
        error instanceof Error
          ? error
          : new Error("Realtime command failed.");

      const code =
        "code" in normalized && typeof normalized.code === "string"
          ? normalized.code
          : "COMMAND_FAILED";

      return {
        requestId: envelope.requestId,
        type: `${envelope.type}.result`,
        ok: false,
        error: {
          code,
          message: normalized.message,
        },
      };
    }
  }
}
