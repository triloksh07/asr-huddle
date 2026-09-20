// import { t } from "../router/index.js";

/**
 * Base procedure exports are centralized here so later authentication and
 * rate-limit middleware can extend one transport-owned procedure chain.
 */
// export const publicProcedure = t.procedure;
import { TRPCError } from '@trpc/server';
import { t } from '../router/core.js';

export const publicProcedure = t.procedure;

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
