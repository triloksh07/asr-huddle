import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

/**
 * Adapter-facing context factory contract.
 *
 * The implementation is supplied when the HTTP adapter is wired. T1 defines
 * the package-owned boundary without constructing ApiRuntime or authentication
 * inside the transport package.
 */
// export type TRPCContextFactory = (
//   options: CreateHTTPContextOptions,
// ) => unknown | Promise<unknown>;

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface AuthenticatedUser {
  readonly id: string;
}

export interface TRPCAuthResult {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
}

export interface TRPCAuthService {
  register(name: string, email: string, password: string): Promise<TRPCAuthResult>;
  login(email: string, password: string): Promise<TRPCAuthResult>;
  authenticate(token: string): string;
}

/**
 * Transport-facing boundary for the authoritative API auth-cookie helpers.
 * The implementation remains in apps/api; @repo/trpc does not duplicate it.
 */
export interface TRPCAuthCookieService {
  read(request: IncomingMessage): string | null;
  serialize(token: string, maxAgeSeconds: number, secure: boolean): string;
}

export interface TRPCRateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

export interface TRPCRateLimiter {
  consume(
    scope: string,
    identifier: string,
    rule: { readonly limit: number; readonly windowMs: number }
  ): Promise<TRPCRateLimitDecision>;
}

export interface TRPCRateLimitConfig {
  readonly authRegisterLimit: number;
  readonly authRegisterWindowMs: number;
  readonly authLoginLimit: number;
  readonly authLoginWindowMs: number;
  readonly roomCreateLimit: number;
  readonly roomCreateWindowMs: number;
}

export interface TRPCRoomControl {
  create(command: {
    readonly userId: string;
    readonly title: string;
    readonly description: string;
    readonly visibility: 'PUBLIC' | 'LINK_ONLY';
    readonly durationMinutes: 60 | 120 | 300;
  }): Promise<unknown>;
  listPublic(): Promise<unknown>;
  get(roomId: string): Promise<unknown>;
  endAsHost(roomId: string, userId: string): Promise<void>;
}

/**
 * Capabilities supplied by the API composition root to the transport layer.
 * This is deliberately structural: @repo/trpc never imports apps/api.
 */
export interface TRPCRuntime {
  readonly auth: TRPCAuthService;
  readonly authCookie: TRPCAuthCookieService;
  readonly rateLimiter: TRPCRateLimiter;
  readonly config: {
    readonly jwtTtlSeconds: number;
    readonly authMode: 'development' | 'production';
    readonly rateLimits: TRPCRateLimitConfig;
  };
  readonly roomControl: TRPCRoomControl;
}

export interface TRPCContextOptions {
  readonly runtime: TRPCRuntime;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
}

export interface TRPCContext {
  readonly runtime: TRPCRuntime;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly user: AuthenticatedUser | null;
}

export type TRPCContextFactory = (
  options: TRPCContextOptions
) => TRPCContext | Promise<TRPCContext>;
