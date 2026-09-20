import { initTRPC } from '@trpc/server';
import type { TRPCContext } from '../context/index.js';

export const t = initTRPC.context<TRPCContext>().create();
