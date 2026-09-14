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
import { RealtimeRateLimitPolicy } from '../security/realtime-rate-limit-policy.js';
import { RateLimitInfrastructureError } from '../security/rate-limiter.js';
import type { RateLimiter } from '../security/rate-limiter.js';

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

const RATE_LIMIT_CODES = new Set(['RATE_LIMITED']);

export interface CommandRouterOptions {
  readonly maxRecentRequestIds?: number;
  readonly rateLimiter?: RateLimiter;
  readonly rateLimitPolicy?: RealtimeRateLimitPolicy;
  readonly maxRateLimitViolations?: number;
  readonly rateLimitViolationWindowMs?: number;
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
  private readonly rateLimitViolations = new WeakMap<
    RealtimeConnection,
    { count: number; windowStartedAt: number }
  >();
  private readonly maxRecentRequestIds: number;
  private readonly rateLimiter?: RateLimiter;
  private readonly rateLimitPolicy?: RealtimeRateLimitPolicy;
  private readonly maxRateLimitViolations: number;
  private readonly rateLimitViolationWindowMs: number;

  constructor(options: CommandRouterOptions = {}) {
    const maxRecentRequestIds = options.maxRecentRequestIds ?? 1_024;
    if (!Number.isInteger(maxRecentRequestIds) || maxRecentRequestIds < 1) {
      throw new Error('maxRecentRequestIds must be a positive integer.');
    }

    const maxRateLimitViolations = options.maxRateLimitViolations ?? 3;
    if (!Number.isInteger(maxRateLimitViolations) || maxRateLimitViolations < 1) {
      throw new Error('maxRateLimitViolations must be a positive integer.');
    }

    const rateLimitViolationWindowMs = options.rateLimitViolationWindowMs ?? 10_000;
    if (!Number.isInteger(rateLimitViolationWindowMs) || rateLimitViolationWindowMs < 1) {
      throw new Error('rateLimitViolationWindowMs must be a positive integer.');
    }

    if (options.rateLimiter && !options.rateLimitPolicy) {
      throw new Error('rateLimitPolicy is required when rateLimiter is configured.');
    }

    this.maxRecentRequestIds = maxRecentRequestIds;
    this.rateLimiter = options.rateLimiter;
    this.rateLimitPolicy = options.rateLimitPolicy;
    this.maxRateLimitViolations = maxRateLimitViolations;
    this.rateLimitViolationWindowMs = rateLimitViolationWindowMs;
  }

  register(handler: RealtimeCommandHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Realtime command already registered: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
  }

  async dispatch(context: RealtimeCommandContext, raw: unknown): Promise<RealtimeResponse> {
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

    const rateLimitResponse = await this.checkRateLimit(context, envelope);
    if (rateLimitResponse) return rateLimitResponse;

    try {
      const payload = await handler.handle(context, envelope);
      this.clearRateLimitViolations(context.connection);
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

  isRateLimitViolation(code: string): boolean {
    return RATE_LIMIT_CODES.has(code);
  }

  shouldCloseForRateLimit(connection: RealtimeConnection): boolean {
    const violation = this.rateLimitViolations.get(connection);
    if (!violation) return false;
    if (Date.now() - violation.windowStartedAt >= this.rateLimitViolationWindowMs) {
      this.rateLimitViolations.delete(connection);
      return false;
    }
    return violation.count >= this.maxRateLimitViolations;
  }

  private async checkRateLimit(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope
  ): Promise<RealtimeResponse | null> {
    if (!this.rateLimiter || !this.rateLimitPolicy) return null;

    const checks = this.rateLimitPolicy.checks(context.connection, envelope);
    if (checks.length === 0) return null;

    try {
      for (const check of checks) {
        const decision = await this.rateLimiter.consume(check.scope, check.identifier, check.rule);

        if (!decision.allowed) {
          this.recordRateLimitViolation(context.connection);
          return {
            requestId: envelope.requestId,
            type: `${envelope.type}.result`,
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests. Please try again later.',
            },
          };
        }
      }
    } catch (error) {
      if (error instanceof RateLimitInfrastructureError) {
        return {
          requestId: envelope.requestId,
          type: `${envelope.type}.result`,
          ok: false,
          error: {
            code: 'RATE_LIMIT_UNAVAILABLE',
            message: 'This operation is temporarily unavailable.',
          },
        };
      }
      throw error;
    }

    return null;
  }

  private recordRateLimitViolation(connection: RealtimeConnection): void {
    const now = Date.now();
    const existing = this.rateLimitViolations.get(connection);

    if (!existing || now - existing.windowStartedAt >= this.rateLimitViolationWindowMs) {
      this.rateLimitViolations.set(connection, {
        count: 1,
        windowStartedAt: now,
      });
      return;
    }

    existing.count += 1;
  }

  private clearRateLimitViolations(connection: RealtimeConnection): void {
    this.rateLimitViolations.delete(connection);
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
