import { describe, expect, it } from 'vitest';
import type { RealtimeConnection, RealtimeEnvelope } from '../../src/realtime/types.js';
import { RealtimeRateLimitPolicy } from '../../src/security/realtime-rate-limit-policy.js';
import type { RateLimitConfig } from '../../src/config.js';

const limits: RateLimitConfig = {
  authRegisterLimit: 5,
  authRegisterWindowMs: 3600000,
  authLoginLimit: 10,
  authLoginWindowMs: 60000,
  connectionLimit: 10,
  connectionWindowMs: 60000,
  commandLimit: 100,
  commandWindowMs: 10000,
  sessionLimit: 10,
  sessionWindowMs: 60000,
  roomCreateLimit: 5,
  roomCreateWindowMs: 3600000,
  speakerRequestLimit: 5,
  speakerRequestWindowMs: 30000,
  reactionBurstLimit: 5,
  reactionBurstWindowMs: 1000,
  reactionSameTypeWindowMs: 4000,
  mediaLimit: 60,
  mediaWindowMs: 10000,
  maxViolations: 3,
  violationWindowMs: 10000,
};
const connection: RealtimeConnection = {
  connectionId: 'c1' as never,
  userId: 'u1' as never,
  participantId: 'p1' as never,
  participantSessionId: 'ps1' as never,
  roomId: 'r1' as never,
  roomSessionId: 'rs1' as never,
  connectedAt: new Date().toISOString(),
  transport: { send() {}, close() {} },
};

describe('RealtimeRateLimitPolicy', () => {
  const policy = new RealtimeRateLimitPolicy(limits);

  it('applies command and session-user checks to room.join', () => {
    const e: RealtimeEnvelope = { requestId: 'r1', type: 'room.join', payload: { roomId: 'r1' } };
    expect(policy.checks(connection, e).map(x => x.scope)).toEqual([
      'realtime.command.connection',
      'realtime.session.user',
    ]);
  });

  it('applies burst and repeated-type checks to reactions', () => {
    const e: RealtimeEnvelope = { requestId: 'r1', type: 'room.reaction', payload: { type: '🔥' } };
    const checks = policy.checks(connection, e);
    expect(checks.map(x => x.scope)).toEqual([
      'realtime.command.connection',
      'realtime.reaction.user',
      'realtime.reaction.type',
    ]);
    expect(checks[2].rule.windowMs).toBe(4000);
  });

  it('keeps ordinary room.leave outside distributed limiting', () => {
    expect(policy.checks(connection, { requestId: 'r1', type: 'room.leave', payload: {} })).toEqual(
      []
    );
  });

  it('applies the media limiter to media commands', () => {
    const checks = policy.checks(connection, {
      requestId: 'r1',
      type: 'media.transport.create',
      payload: { direction: 'recv' },
    });
    expect(checks.map(x => x.scope)).toContain('realtime.media');
  });
});
