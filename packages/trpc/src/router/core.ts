import { initTRPC } from '@trpc/server';
import type { TRPCContext } from '../context/index.js';

export const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error, ctx }) {
    ctx?.runtime.logger?.error('trpc_request_failed', {
      path: shape.data.path,
      code: shape.data.code,
      error,
    });

    const { stack: _stack, ...safeData } = shape.data;

    return {
      ...shape,
      data: safeData,
    };
  },
});
