import { TRPCError } from '@trpc/server';
import { mapTRPCError } from '../../errors/index.js';
import { protectedProcedure } from '../../middleware/index.js';
import {
  createRoomInputSchema,
  createRoomOutputSchema,
  roomEndOutputSchema,
  roomIdInputSchema,
  roomListOutputSchema,
  roomStateOutputSchema,
} from '../../schemas/index.js';

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

export const roomRouter = {
  create: protectedProcedure
    .input(createRoomInputSchema)
    .output(createRoomOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.runtime.rateLimiter.consume('http.room.create', ctx.user.id, {
        limit: ctx.runtime.config.rateLimits.roomCreateLimit,
        windowMs: ctx.runtime.config.rateLimits.roomCreateWindowMs,
      });
      
      if (!decision.allowed) {
        applyRetryAfter(ctx.response, decision.retryAfterMs);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again later.',
        });
      }
      
      try {
        return await ctx.runtime.roomControl.create({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          visibility: input.visibility,
          durationMinutes: input.durationMinutes,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unable to create room.',
          cause: error,
        });
      }
    }),

  listPublic: protectedProcedure.output(roomListOutputSchema).query(async ({ ctx }) => {
    try {
      return await ctx.runtime.roomControl.listPublic();
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Unable to list rooms.',
        cause: error,
      });
    }
  }),

  get: protectedProcedure
    .input(roomIdInputSchema)
    .output(roomStateOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.runtime.roomControl.get(input.roomId);
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error instanceof Error ? error.message : 'Room was not found.',
          cause: error,
        });
      }
    }),

  end: protectedProcedure
    .input(roomIdInputSchema)
    .output(roomEndOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ctx.runtime.roomControl.endAsHost(input.roomId, ctx.user.id);
        if (result.status === 'ENDED') {
          return {
            success: true as const,
            roomId: result.roomId,
            status: result.status,
            roomSessionId: result.roomSessionId,
          };
        }
        return { success: true as const, roomId: result.roomId, status: result.status };
      } catch (error) {
        throw mapTRPCError(error);
      }
    }),
};
