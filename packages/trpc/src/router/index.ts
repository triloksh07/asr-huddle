import { t } from './core.js';
import { protectedProcedure, publicProcedure } from '../middleware/index.js';

export { t } from './core.js';
export { protectedProcedure, publicProcedure } from '../middleware/index.js';

export const appRouter = t.router({});

export type AppRouter = typeof appRouter;
