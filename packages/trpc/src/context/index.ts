/**
 * Context is intentionally owned by @repo/trpc.
 *
 * The concrete ASR runtime/request/response/auth integration is introduced in
 * the context and authentication batches. Keeping this boundary here prevents
 * transport code from leaking application dependencies into the package root.
 */
// export type { TRPCContextFactory } from "./types.js";
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedUser, TRPCContext, TRPCContextFactory, TRPCRuntime } from './types.js';

export type {
  AuthenticatedUser,
  TRPCAuthCookieService,
  TRPCAuthResult,
  TRPCAuthService,
  TRPCContext,
  TRPCContextFactory,
  TRPCContextOptions,
  TRPCRateLimitConfig,
  TRPCRateLimitDecision,
  TRPCRateLimiter,
  TRPCRoomControl,
  TRPCRuntime,
} from './types.js';

function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function readAccessToken(runtime: TRPCRuntime, request: IncomingMessage): string | null {
  return readBearerToken(request) ?? runtime.authCookie.read(request);
}

function authenticate(runtime: TRPCRuntime, request: IncomingMessage): AuthenticatedUser | null {
  const token = readAccessToken(runtime, request);
  if (!token) return null;

  try {
    const userId = runtime.auth.authenticate(token);
    return userId ? { id: userId } : null;
  } catch {
    return null;
  }
}

export function createTRPCContext(options: {
  readonly runtime: TRPCRuntime;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
}): TRPCContext {
  return {
    runtime: options.runtime,
    request: options.request,
    response: options.response,
    user: authenticate(options.runtime, options.request),
  };
}

export const createContext: TRPCContextFactory = createTRPCContext;
