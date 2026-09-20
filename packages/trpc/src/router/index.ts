import { t } from './core.js';
import { protectedProcedure, publicProcedure } from '../middleware/index.js';
import { authRouter } from './auth/index.js';
import { roomRouter } from './room/index.js';

export { t } from './core.js';
export { protectedProcedure, publicProcedure } from '../middleware/index.js';

export const appRouter = t.router({
  auth: t.router(authRouter),
  room: t.router(roomRouter),
});

export type AppRouter = typeof appRouter;
