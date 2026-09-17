import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@repo/application';
import { CommandRouter } from '../../src/realtime/command-router.js';

const context = (connectionId = 'c1') => ({
  connection: {
    connectionId,
    userId: 'u1',
    participantId: null,
    participantSessionId: null,
    roomId: null,
    roomSessionId: null,
    connectedAt: new Date().toISOString(),
  },
  transport: { send: vi.fn(), close: vi.fn() },
});

describe('CommandRouter', () => {
  it('rejects malformed envelopes', async () => {
    const result = await new CommandRouter().dispatch(context(), { type: 'room.join' });
    expect(result.error?.code).toBe('INVALID_MESSAGE');
  });

  it('scopes duplicate request ids to a connection', async () => {
    const handler = { type: 'test', handle: vi.fn().mockResolvedValue({ ok: true }) };
    const router = new CommandRouter();
    router.register(handler);
    await router.dispatch(context('c1'), { requestId: 'r1', type: 'test', payload: {} });
    expect(
      (await router.dispatch(context('c2'), { requestId: 'r1', type: 'test', payload: {} })).ok
    ).toBe(true);
    expect(handler.handle).toHaveBeenCalledTimes(2);
  });

  it('bounds the recent request-id cache', async () => {
    const handler = { type: 'test', handle: vi.fn().mockResolvedValue(undefined) };
    const router = new CommandRouter({ maxRecentRequestIds: 2 });
    router.register(handler);
    for (const requestId of ['r1', 'r2', 'r3'])
      await router.dispatch(context(), { requestId, type: 'test', payload: {} });
    expect(
      (await router.dispatch(context(), { requestId: 'r1', type: 'test', payload: {} })).ok
    ).toBe(true);
  });

  it('sanitizes unknown errors and preserves application errors', async () => {
    const router = new CommandRouter();
    router.register({ type: 'bad', handle: vi.fn().mockRejectedValue(new Error('secret')) });
    expect(
      (await router.dispatch(context(), { requestId: 'r1', type: 'bad', payload: {} })).error
    ).toEqual({ code: 'COMMAND_FAILED', message: 'Realtime command failed.' });
    router.register({
      type: 'known',
      handle: vi.fn().mockRejectedValue(new ApplicationError('FORBIDDEN', 'Denied.')),
    });
    expect(
      (await router.dispatch(context(), { requestId: 'r2', type: 'known', payload: {} })).error
    ).toEqual({ code: 'FORBIDDEN', message: 'Denied.' });
  });
});
