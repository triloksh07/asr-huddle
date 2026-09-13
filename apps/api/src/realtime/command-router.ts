import { ApplicationError } from '@repo/application';
import { z } from 'zod';
import { RealtimeError, realtimeErrors } from './errors.js';
import type {
  RealtimeCommandContext,
  RealtimeConnection,
  RealtimeCommandHandler,
  RealtimeEnvelope,
  RealtimeResponse,
} from './types.js';

const envelopeSchema = z.object({
  requestId: z.string().min(1).max(128),
  type: z.string().min(1).max(128),
  payload: z.unknown(),
});

const SAFE_APPLICATION_ERROR_CODES = new Set([
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'FORBIDDEN',
  'CONFLICT',
  'CAPACITY_EXCEEDED',
  'ROOM_ENDED',
  'ROOM_SESSION_ENDED',
  'INVALID_TARGET',
  'INVALID_STATE',
]);

const PROTOCOL_VIOLATION_CODES = new Set([
  'INVALID_MESSAGE',
  'UNSUPPORTED_COMMAND',
  'DUPLICATE_REQUEST_ID',
]);

export interface CommandRouterOptions {
  readonly maxRecentRequestIds?: number;
}

function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof RealtimeError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof ApplicationError && SAFE_APPLICATION_ERROR_CODES.has(error.code)) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'COMMAND_FAILED',
    message: 'Realtime command failed.',
  };
}

export class CommandRouter {
  private readonly handlers = new Map<string, RealtimeCommandHandler>();
  private readonly recentRequestIds = new WeakMap<RealtimeConnection, Set<string>>();
  private readonly maxRecentRequestIds: number;

  constructor(options: CommandRouterOptions = {}) {
    const maxRecentRequestIds = options.maxRecentRequestIds ?? 1_024;
    if (!Number.isInteger(maxRecentRequestIds) || maxRecentRequestIds < 1) {
      throw new Error('maxRecentRequestIds must be a positive integer.');
    }
    this.maxRecentRequestIds = maxRecentRequestIds;
  }

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
        requestId: 'unknown',
        type: 'error',
        ok: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: realtimeErrors.invalidMessage().message,
        },
      };
    }

    const envelope = parsed.data as RealtimeEnvelope;
    const recentRequestIds = this.recentRequestIdsFor(context.connection);

    if (recentRequestIds.has(envelope.requestId)) {
      return {
        requestId: envelope.requestId,
        type: 'error',
        ok: false,
        error: {
          code: 'DUPLICATE_REQUEST_ID',
          message: 'Request id has already been used on this connection.',
        },
      };
    }

    this.rememberRequestId(recentRequestIds, envelope.requestId);

    const handler = this.handlers.get(envelope.type);

    if (!handler) {
      return {
        requestId: envelope.requestId,
        type: 'error',
        ok: false,
        error: {
          code: 'UNSUPPORTED_COMMAND',
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
      const normalized = publicError(error);
      return {
        requestId: envelope.requestId,
        type: `${envelope.type}.result`,
        ok: false,
        error: normalized,
      };
    }
  }

  isProtocolViolation(code: string): boolean {
    return PROTOCOL_VIOLATION_CODES.has(code);
  }

  private recentRequestIdsFor(connection: RealtimeConnection): Set<string> {
    let recentRequestIds = this.recentRequestIds.get(connection);
    if (!recentRequestIds) {
      recentRequestIds = new Set<string>();
      this.recentRequestIds.set(connection, recentRequestIds);
    }
    return recentRequestIds;
  }

  private rememberRequestId(recentRequestIds: Set<string>, requestId: string): void {
    if (recentRequestIds.size >= this.maxRecentRequestIds) {
      const oldest = recentRequestIds.values().next().value;
      if (oldest !== undefined) recentRequestIds.delete(oldest);
    }
    recentRequestIds.add(requestId);
  }
}
