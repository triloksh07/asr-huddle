// import { initTRPC } from "@trpc/server";

/**
 * ASR Huddle's server-side tRPC foundation.
 *
 * This package owns the transport boundary only. Application behavior remains
 * in @repo/application and is consumed by procedures in later implementation
 * batches.
 */
// export const t = initTRPC.create();

// export const appRouter = t.router({});

// export type AppRouter = typeof appRouter;

import { t } from './core.js';
import { protectedProcedure, publicProcedure } from '../middleware/index.js';

export { t } from './core.js';
export { protectedProcedure, publicProcedure } from '../middleware/index.js';

export const appRouter = t.router({});

export type AppRouter = typeof appRouter;
