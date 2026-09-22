import { createTRPCContext, type TRPCRuntime } from '@repo/trpc';
import type { ApiRuntime } from '../runtime/composition-root.js';
import { readAuthCookie, serializeAuthCookie } from '../auth/auth-cookie.js';

export function toTRPCRuntime(runtime: ApiRuntime): TRPCRuntime {
  return {
    auth: runtime.auth,
    authCookie: {
      read: readAuthCookie,
      serialize: serializeAuthCookie,
    },
    rateLimiter: runtime.rateLimiter,
    config: {
      jwtTtlSeconds: runtime.config.jwtTtlSeconds,
      authMode: runtime.config.authMode,
      rateLimits: {
        authRegisterLimit: runtime.config.rateLimits.authRegisterLimit,
        authRegisterWindowMs: runtime.config.rateLimits.authRegisterWindowMs,
        authLoginLimit: runtime.config.rateLimits.authLoginLimit,
        authLoginWindowMs: runtime.config.rateLimits.authLoginWindowMs,
        roomCreateLimit: runtime.config.rateLimits.roomCreateLimit,
        roomCreateWindowMs: runtime.config.rateLimits.roomCreateWindowMs,
      },
    },
    roomControl: runtime.roomControl,
    // roomControl: runtime.roomControl as unknown as TRPCRuntime['roomControl'],
    logger: runtime.logger,
  };
}

export function createApiTRPCContext(runtime: ApiRuntime) {
  return ({
    req,
    res,
  }: {
    req: import('node:http').IncomingMessage;
    res: import('node:http').ServerResponse;
  }) =>
    createTRPCContext({
      runtime: toTRPCRuntime(runtime),
      request: req,
      response: res,
    });
}
