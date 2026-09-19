import { describe, expect, it } from 'vitest';
import { DisconnectRoom, JoinRoom, LeaveRoom, ReconnectRoom } from '../src/index.js';
import {
  createParticipant,
  createParticipantSession,
  markDisconnected,
  type ConnectionId,
  type ParticipantSessionState,
} from '@repo/domain';
import { applicationFixture, base } from './support/memory-application.js';

const later = new Date('2026-01-01T10:00:10.000Z');
function seed(f: ReturnType<typeof applicationFixture>) {
  const p = markDisconnected(
    createParticipant({
      id: 'p1' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'user-1' as never,
      joinedAt: base,
    }),
    later
  );
  const s: ParticipantSessionState = {
    ...createParticipantSession({
      id: 'ps1' as never,
      participantId: p.id,
      connectionId: 'old' as ConnectionId,
      connectedAt: base,
    }),
    disconnectedAt: later,
    recoverableUntil: new Date(later.getTime() + 30000),
  };
  void f.participants.save(p);
  void f.participantSessions.save(s);
  return { p, s };
}
describe('participant session lifecycle', () => {
  it('releases binding on intentional leave and permits a new join', async () => {
    const f = applicationFixture();
    const j = new JoinRoom(f.transaction, f.ids, { now: () => base }, f.eventPublisher);
    const joined = await j.execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'c1' as ConnectionId,
    });
    await new LeaveRoom(f.transaction, { now: () => later }, f.eventPublisher).execute({
      participantId: joined.participantId,
      participantSessionId: joined.participantSessionId,
    });
    const old = f.participantSessions.values.get(joined.participantSessionId)!;
    expect(old.intentionalLeave).toBe(true);
    expect(old.connectionId).toBeNull();
    expect(old.recoverableUntil).toBeNull();
    expect(old.disconnectedAt).not.toBeNull();
    const again = await j.execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'c2' as ConnectionId,
    });
    expect(again.participantId).not.toBe(joined.participantId);
    expect(again.participantSessionId).not.toBe(joined.participantSessionId);
  });
  it('retains old binding across temporary disconnect', async () => {
    const f = applicationFixture();
    const p = createParticipant({
      id: 'p1' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'user-1' as never,
      joinedAt: base,
    });
    const s = createParticipantSession({
      id: 'ps1' as never,
      participantId: p.id,
      connectionId: 'old' as ConnectionId,
      connectedAt: base,
    });
    await f.participants.save(p);
    await f.participantSessions.save(s);
    expect(
      await new DisconnectRoom(f.transaction, { now: () => later }, f.eventPublisher).execute({
        participantId: p.id,
        participantSessionId: s.id,
        connectionId: 'old',
        recoverableForMs: 30000,
      })
    ).toBe(true);
    const stored = f.participantSessions.values.get(s.id)!;
    expect(stored.connectionId).toBe('old');
    expect(stored.disconnectedAt).toEqual(later);
    expect(stored.recoverableUntil).toEqual(new Date(later.getTime() + 30000));
    expect(stored.intentionalLeave).toBe(false);
    expect(f.participants.values.get(p.id)?.status).toBe('DISCONNECTED');
  });
  it('reconnects same participant/session and swaps connection', async () => {
    const f = applicationFixture();
    const { p, s } = seed(f);
    const result = await new ReconnectRoom(
      f.transaction,
      { now: () => new Date('2026-01-01T10:00:15.000Z') },
      f.eventPublisher
    ).execute({
      roomId: f.room.id,
      participantId: p.id,
      participantSessionId: s.id,
      connectionId: 'new' as ConnectionId,
      userId: 'user-1',
    });
    expect(result.participantId).toBe(p.id);
    expect(result.participantSessionId).toBe(s.id);
    expect(result.audioRole).toBe('LISTENER');
    const stored = f.participantSessions.values.get(s.id)!;
    expect(stored.connectionId).toBe('new');
    expect(stored.disconnectedAt).toBeNull();
    expect(stored.recoverableUntil).toBeNull();
    expect(f.participants.values.get(p.id)?.status).toBe('CONNECTED');
  });
  it('rejects a stale reconnect after the participant is already connected again', async () => {
    const f = applicationFixture();
    const { p, s } = seed(f);
    const r = new ReconnectRoom(
      f.transaction,
      { now: () => new Date('2026-01-01T10:00:15.000Z') },
      f.eventPublisher
    );
    await r.execute({
      roomId: f.room.id,
      participantId: p.id,
      participantSessionId: s.id,
      connectionId: 'new' as ConnectionId,
      userId: 'user-1',
    });
    await expect(
      r.execute({
        roomId: f.room.id,
        participantId: p.id,
        participantSessionId: s.id,
        connectionId: 'stale' as ConnectionId,
        userId: 'user-1',
      })
    ).rejects.toThrow('not in a recoverable disconnected state');
  });
  it('does not let JOIN bypass a recoverable disconnected participation', async () => {
    const f = applicationFixture();
    seed(f);
    await expect(
      new JoinRoom(f.transaction, f.ids, { now: () => later }, f.eventPublisher).execute({
        roomId: f.room.id,
        userId: 'user-1',
        connectionId: 'new' as ConnectionId,
      })
    ).rejects.toThrow('Use room.reconnect');
  });
  it('allows a removed participant to create a fresh participation', async () => {
    const f = applicationFixture();
    const removed = {
      ...createParticipant({
        id: 'p1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as never,
        joinedAt: base,
      }),
      status: 'REMOVED' as const,
      removedAt: later,
    };
    await f.participants.save(removed);
    const joined = await new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => later },
      f.eventPublisher
    ).execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'new' as ConnectionId });
    expect(joined.participantId).not.toBe(removed.id);
  });
});
