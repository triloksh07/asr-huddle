import { describe, expect, it } from 'vitest';
import type { RealtimeConnection, RealtimeEnvelope } from '../../src/realtime/types.js';
import { RealtimeRateLimitPolicy } from '../../src/security/realtime-rate-limit-policy.js';
import type { RateLimitConfig } from '../../src/config.js';

const rateLimits: RateLimitConfig = {
  authRegisterLimit: 5,
  authRegisterWindowMs: 3_600_000,
  authLoginLimit: 10,
  authLoginWindowMs: 60_000,
  connectionLimit: 10,
  connectionWindowMs: 60_000,
  commandLimit: 100,
  commandWindowMs: 10_000,
  sessionLimit: 10,
  sessionWindowMs: 60_000,
  roomCreateLimit: 5,
  roomCreateWindowMs: 3_600_000,
  speakerRequestLimit: 5,
  speakerRequestWindowMs: 30_000,
  reactionBurstLimit: 5,
  reactionBurstWindowMs: 1_000,
  reactionSameTypeWindowMs: 4_000,
  mediaLimit: 60,
  mediaWindowMs: 10_000,
  maxViolations: 3,
  violationWindowMs: 10_000,
};

const connection: RealtimeConnection = {
  connectionId: 'connection-1' as RealtimeConnection['connectionId'],
  userId: 'user-1' as RealtimeConnection['userId'],
  participantId: 'participant-1' as RealtimeConnection['participantId'],
  participantSessionId: 'session-1' as RealtimeConnection['participantSessionId'],
  roomId: 'room-1' as RealtimeConnection['roomId'],
  roomSessionId: 'room-session-1' as RealtimeConnection['roomSessionId'],
  connectedAt: new Date().toISOString(),
};

describe('RealtimeRateLimitPolicy', () => {
  const policy = new RealtimeRateLimitPolicy(rateLimits);

  it('rate-limits room session commands by connection and user', () => {
    const envelope: RealtimeEnvelope = {
      requestId: 'request-1',
      type: 'room.join',
      payload: { roomId: 'room-1' },
    };

    const checks = policy.checks(connection, envelope);

    expect(checks.map(check => check.scope)).toEqual([
      'realtime.command.connection',
      'realtime.session.user',
    ]);
  });

  it('rate-limits reactions by burst and repeated reaction type', () => {
    const envelope: RealtimeEnvelope = {
      requestId: 'request-1',
      type: 'room.reaction',
      payload: { type: '🔥' },
    };

    const checks = policy.checks(connection, envelope);

    expect(checks.map(check => check.scope)).toEqual([
      'realtime.command.connection',
      'realtime.reaction.user',
      'realtime.reaction.type',
    ]);
    expect(checks[1].rule.limit).toBe(5);
    expect(checks[2].rule.limit).toBe(1);
    expect(checks[2].rule.windowMs).toBe(4_000);
  });

  it('does not require Redis rate limiting for ordinary room commands', () => {
    const envelope: RealtimeEnvelope = {
      requestId: 'request-1',
      type: 'room.leave',
      payload: {},
    };

    expect(policy.checks(connection, envelope)).toEqual([]);
  });
});
