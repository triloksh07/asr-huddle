import { describe, expect, it } from 'vitest';
import { JoinRoom } from '../src/index.js';
import {
  createHostParticipant,
  createParticipantSession,
  markDisconnected,
  type ConnectionId,
  type ParticipantSessionState,
} from '@repo/domain';
import { applicationFixture, base } from './support/memory-application.js';

const disconnectedAt = new Date('2026-01-01T10:00:01.000Z');
const recoverableUntil = new Date('2026-01-01T10:00:30.000Z');
const expiredAt = new Date('2026-01-01T10:00:31.000Z');

function seed(f: ReturnType<typeof applicationFixture>) {
  const participant = markDisconnected(
    createHostParticipant({
      id: 'old-participant' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'user-1' as never,
      joinedAt: base,
    }),
    disconnectedAt
  );
  const session: ParticipantSessionState = {
    ...createParticipantSession({
      id: 'old-session' as never,
      participantId: participant.id,
      connectionId: 'old-connection' as ConnectionId,
      connectedAt: base,
    }),
    disconnectedAt,
    recoverableUntil,
  };
  void f.participants.save(participant);
  void f.participantSessions.save(session);
  return { participant, session };
}
describe('Bug 16 — expired recovery retirement', () => {
  it('blocks JOIN while recovery is valid', async () => {
    const f = applicationFixture();
    const { participant } = seed(f);
    const join = new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => new Date('2026-01-01T10:00:10.000Z') },
      f.eventPublisher
    );
    await expect(
      join.execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'new' as ConnectionId })
    ).rejects.toThrow('Use room.reconnect');
    expect(f.participants.values.get(participant.id)?.status).toBe('DISCONNECTED');
    const s = f.participantSessions.values.get('old-session')!;
    expect(s.connectionId).toBe('old-connection');
    expect(s.recoverableUntil).toEqual(recoverableUntil);
    expect(s.intentionalLeave).toBe(false);
  });
  it('retires expired HOST state and permits a fresh HOST JOIN', async () => {
    const f = applicationFixture();
    const { participant, session } = seed(f);
    await f.rooms.save({ ...f.room, hostUserId: 'user-1' as never });
    const joined = await new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => expiredAt },
      f.eventPublisher
    ).execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'new' as ConnectionId });
    expect(joined.managementRole).toBe('HOST');
    expect(joined.participantId).not.toBe(participant.id);
    const retired = f.participants.values.get(participant.id)!;
    expect(retired.status).toBe('LEFT');
    expect(retired.managementRole).toBe('NONE');
    expect(retired.audioRole).toBe('LISTENER');
    const closed = f.participantSessions.values.get(session.id)!;
    expect(closed.connectionId).toBeNull();
    expect(closed.recoverableUntil).toBeNull();
    expect(closed.intentionalLeave).toBe(false);
    expect(closed.disconnectedAt).toEqual(disconnectedAt);
  });
});
