import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  CreateRoomOutput,
  RoomEndOutput,
  RoomListOutput,
  RoomState,
} from '../schemas/room.js';

export interface AuthenticatedUser {
  readonly id: string;
}

export interface TRPCAuthResult {
  readonly accessToken: string;
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
}

export interface TRPCAuthService {
  register(name: string, email: string, password: string): Promise<TRPCAuthResult>;
  login(email: string, password: string): Promise<TRPCAuthResult>;
  authenticate(token: string): string;
}

/**
 * Transport-facing boundary for the authoritative API auth-cookie helpers.
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

/**
 * Transport-facing application capability.
 */
export interface TRPCRoomControl {
  create(command: {
    readonly userId: string;
    readonly title: string;
    readonly description: string;
    readonly visibility: 'PUBLIC' | 'LINK_ONLY';
    readonly durationMinutes: 60 | 120 | 300;
  }): Promise<CreateRoomOutput>;
  listPublic(): Promise<RoomListOutput>;
  get(roomId: string): Promise<RoomState>;
  endAsHost(roomId: string, userId: string): Promise<RoomEndOutput>;
}

export interface TRPCLogger {
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Capabilities supplied by the API composition root to the transport layer.
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
  readonly logger?: TRPCLogger;
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
