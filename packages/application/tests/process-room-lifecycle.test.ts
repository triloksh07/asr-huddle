import { describe, expect, it } from 'vitest';
import { EndRoom, ProcessRoomLifecycle } from '../src/index.js';
import {
  createParticipant,
  createParticipantSession,
  markDisconnected,
  markLeft,
  markSessionDisconnected,
} from '@repo/domain';
import { applicationFixture } from './support/memory-application.js';

const clock = (value: string) => ({ now: () => new Date(value) });
function makeLifecycle(f: ReturnType<typeof applicationFixture>, value: string) {
  const c = clock(value);
  return new ProcessRoomLifecycle(
    f.roomSessions,
    f.participants,
    f.participantSessions,
    new EndRoom(f.transaction, c, f.eventPublisher),
    c,
    f.eventPublisher
  );
}
describe('ProcessRoomLifecycle', () => {
  it('issues one durable five-minute warning', async () => {
    const f = applicationFixture();
    const l = makeLifecycle(f, '2026-01-01T10:55:00.000Z');
    await l.execute();
    await l.execute();
    expect(f.events.filter(e => e.type === 'room.expiry.warning')).toHaveLength(1);
    expect(f.roomSessions.values.get(f.session.id)?.expiryWarningIssuedAt).not.toBeNull();
  });
  it('ends an expired room with EXPIRY', async () => {
    const f = applicationFixture();
    const l = makeLifecycle(f, '2026-01-01T11:00:00.000Z');
    expect(await l.execute()).toEqual({
      warningsIssued: 0,
      endedRooms: [{ roomId: 'room-1', roomSessionId: 'room-session-1', reason: 'EXPIRY' }],
    });
    expect(f.events.find(e => e.type === 'room.ended')?.payload).toEqual({ reason: 'EXPIRY' });
    expect(f.rooms.values.get(f.room.id)?.status).toBe('ENDED');
  });
  it('does not end while a disconnected participant remains recoverable', async () => {
    const f = applicationFixture();
    const p = markDisconnected(
      createParticipant({
        id: 'p1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as never,
        joinedAt: f.room.createdAt,
      }),
      new Date('2026-01-01T10:30:00.000Z')
    );
    const ps = markSessionDisconnected(
      createParticipantSession({
        id: 'ps1' as never,
        participantId: p.id,
        connectionId: 'c1' as never,
        connectedAt: f.room.createdAt,
      }),
      new Date('2026-01-01T10:30:00.000Z'),
      new Date('2026-01-01T10:31:00.000Z')
    );
    await f.participants.save(p);
    await f.participantSessions.save(ps);
    expect((await makeLifecycle(f, '2026-01-01T10:30:30.000Z').execute()).endedRooms).toEqual([]);
  });
  it('ends once the final participant has intentionally left', async () => {
    const f = applicationFixture();
    await f.participants.save(
      markLeft(
        createParticipant({
          id: 'p1' as never,
          roomId: f.room.id,
          roomSessionId: f.session.id,
          userId: 'user-1' as never,
          joinedAt: f.room.createdAt,
        }),
        new Date('2026-01-01T10:30:00.000Z')
      )
    );
    const result = await makeLifecycle(f, '2026-01-01T10:30:00.000Z').execute();
    expect(result.endedRooms[0]?.reason).toBe('EMPTY');
    expect(f.rooms.values.get(f.room.id)?.status).toBe('ENDED');
  });
});
