import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@repo/application';
import { mapApplicationError, mapTRPCError } from '../src/errors/index.js';

describe('tRPC error mapping', () => {
  it.each([
    ['UNAUTHENTICATED', 'UNAUTHORIZED'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['FORBIDDEN', 'FORBIDDEN'],
    ['CONFLICT', 'CONFLICT'],
    ['CAPACITY_EXCEEDED', 'CONFLICT'],
    ['ROOM_ENDED', 'CONFLICT'],
    ['ROOM_SESSION_ENDED', 'CONFLICT'],
    ['INVALID_TARGET', 'BAD_REQUEST'],
    ['INVALID_STATE', 'BAD_REQUEST'],
  ] as const)('maps %s to %s', (applicationCode, trpcCode) => {
    const error = mapApplicationError(new ApplicationError(applicationCode, 'test error'));
    expect(error.code).toBe(trpcCode);
    expect(error.message).toBe('test error');
  });

  it('does not replace an existing TRPCError', () => {
    const original = mapApplicationError(new ApplicationError('FORBIDDEN', 'forbidden'));
    expect(mapTRPCError(original)).toBe(original);
  });

  it('hides unknown internal errors behind the transport-safe message', () => {
    const error = mapApplicationError(new Error('database connection details'));
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('Internal server error.');
  });
});
