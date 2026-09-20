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

export interface TRPCAuthService {
  authenticate(token: string): string;
}

export interface TRPCRuntime {
  readonly auth: TRPCAuthService;
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
