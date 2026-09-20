import { ApplicationError } from '@repo/application';
import { TRPCError } from '@trpc/server';

export function mapApplicationError(error: unknown): TRPCError {
  if (!(error instanceof ApplicationError)) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
      cause: error,
    });
  }

  switch (error.code) {
    case 'UNAUTHENTICATED':
      return new TRPCError({ code: 'UNAUTHORIZED', message: error.message, cause: error });
    case 'NOT_FOUND':
      return new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
    case 'FORBIDDEN':
      return new TRPCError({ code: 'FORBIDDEN', message: error.message, cause: error });
    case 'CONFLICT':
      return new TRPCError({ code: 'CONFLICT', message: error.message, cause: error });
    case 'CAPACITY_EXCEEDED':
    case 'ROOM_ENDED':
    case 'ROOM_SESSION_ENDED':
      return new TRPCError({ code: 'CONFLICT', message: error.message, cause: error });
    case 'INVALID_TARGET':
    case 'INVALID_STATE':
      return new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
  }
}

export function mapTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  return mapApplicationError(error);
}
