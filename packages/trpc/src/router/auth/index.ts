import { TRPCError } from '@trpc/server';
import {
  authLogoutResultSchema,
  authResultSchema,
  loginInputSchema,
  registerInputSchema,
} from '../../schemas/index.js';
import { publicProcedure } from '../../middleware/index.js';

function getRateLimitIdentifier(request: {
  socket?: { remoteAddress?: string | undefined };
}): string {
  return request.socket?.remoteAddress ?? '';
}

function applyRetryAfter(
  response: { setHeader(name: string, value: string): void },
  retryAfterMs: number
): void {
  response.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
}
export const authRouter = {
  register: publicProcedure
    .input(registerInputSchema)
    .output(authResultSchema)
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.runtime.rateLimiter.consume(
        'http.auth.register',
        getRateLimitIdentifier(ctx.request),
        {
          limit: ctx.runtime.config.rateLimits.authRegisterLimit,
          windowMs: ctx.runtime.config.rateLimits.authRegisterWindowMs,
        }
      );

      if (!decision.allowed) {
        applyRetryAfter(ctx.response, decision.retryAfterMs);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again later.',
        });
      }

      try {
        const result = await ctx.runtime.auth.register(input.name, input.email, input.password);

        ctx.response.setHeader(
          'Set-Cookie',
          ctx.runtime.authCookie.serialize(
            result.accessToken,
            ctx.runtime.config.jwtTtlSeconds,
            ctx.runtime.config.authMode === 'production'
          )
        );

        return { user: result.user };
      } catch (error) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: error instanceof Error ? error.message : 'Unable to register account.',
          cause: error,
        });
      }
    }),

  login: publicProcedure
    .input(loginInputSchema)
    .output(authResultSchema)
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.runtime.rateLimiter.consume(
        'http.auth.login',
        getRateLimitIdentifier(ctx.request),
        {
          limit: ctx.runtime.config.rateLimits.authLoginLimit,
          windowMs: ctx.runtime.config.rateLimits.authLoginWindowMs,
        }
      );

      if (!decision.allowed) {
        applyRetryAfter(ctx.response, decision.retryAfterMs);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again later.',
        });
      }

      try {
        const result = await ctx.runtime.auth.login(input.email, input.password);

        ctx.response.setHeader(
          'Set-Cookie',
          ctx.runtime.authCookie.serialize(
            result.accessToken,
            ctx.runtime.config.jwtTtlSeconds,
            ctx.runtime.config.authMode === 'production'
          )
        );

        return { user: result.user };
      } catch (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.',
          cause: error,
        });
      }
    }),

  logout: publicProcedure.output(authLogoutResultSchema).mutation(({ ctx }) => {
    ctx.response.setHeader(
      'Set-Cookie',
      ctx.runtime.authCookie.clear(ctx.runtime.config.authMode === 'production')
    );

    return { success: true as const };
  }),
};
