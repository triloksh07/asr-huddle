import { describe, expect, it } from 'vitest';
import {
  JoinRoom,
  type DomainEvent,
  type ParticipantRepository,
  type ParticipantSessionRepository,
  type RoomRepository,
  type RoomSessionRepository,
  type Transaction,
  type TransactionScope,
  type UserRepository,
} from '../src/index.js';
import {
  createHostParticipant,
  createParticipantSession,
  createRoom,
  createRoomSession,
  markDisconnected,
  type ConnectionId,
  type ParticipantSessionState,
  type ParticipantState,
  type RoomSessionState,
  type RoomState,
  type UserId,
} from '@repo/domain';

const base = new Date('2026-01-01T10:00:00.000Z');
const disconnectedAt = new Date('2026-01-01T10:00:01.000Z');
const recoverableUntil = new Date('2026-01-01T10:00:30.000Z');
const expiredAt = new Date('2026-01-01T10:00:31.000Z');

class Users implements UserRepository {
  async findById(id: string) {
    return id === 'user-1' ? { id, name: 'User', avatarUrl: null, bio: null } : null;
  }
}
class Rooms implements RoomRepository {
  constructor(private readonly room: RoomState) {}
  async findById(id: string) {
    return id === this.room.id ? this.room : null;
  }
  async findActivePublic() {
    return [this.room];
  }
  async save(_room: RoomState) {}
}
class Sessions implements RoomSessionRepository {
  constructor(private readonly session: RoomSessionState) {}
  async findActiveByRoomId(id: string) {
    return id === this.session.roomId ? this.session : null;
  }
  async findActive() {
    return [this.session];
  }
  async save(_session: RoomSessionState) {}
}
class Participants implements ParticipantRepository {
  readonly values = new Map<string, ParticipantState>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findByRoomSession(id: string) {
    return [...this.values.values()].filter(p => p.roomSessionId === id);
  }
  async findByUserAndRoomSession(user: string, room: string) {
    return (
      [...this.values.values()].find(p => p.userId === user && p.roomSessionId === room) ?? null
    );
  }
  async findConnectedByUserId(user: string) {
    return (
      [...this.values.values()].find(p => p.userId === user && p.status === 'CONNECTED') ?? null
    );
  }
  async save(p: ParticipantState) {
    this.values.set(p.id, p);
  }
}
class ParticipantSessions implements ParticipantSessionRepository {
  readonly values = new Map<string, ParticipantSessionState>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findActiveByParticipantId(id: string) {
    return (
      [...this.values.values()].find(s => s.participantId === id && s.status === 'ACTIVE') ?? null
    );
  }
  async findByParticipantId(id: string) {
    return [...this.values.values()].filter(s => s.participantId === id);
  }
  async claimReconnect() {
    return null;
  }
  async save(s: ParticipantSessionState) {
    this.values.set(s.id, s);
  }
}
class Scope implements TransactionScope {
  readonly users = new Users();
  readonly participants = new Participants();
  readonly participantSessions = new ParticipantSessions();
  readonly speakerRequests = {
    findById: async () => null,
    findPendingByParticipantId: async () => null,
    save: async () => {},
  };
  readonly invitations = {
    findById: async () => null,
    findPendingByParticipantId: async () => null,
    save: async () => {},
  };
  readonly rooms: Rooms;
  readonly roomSessions: Sessions;
  constructor(room: RoomState, session: RoomSessionState) {
    this.rooms = new Rooms(room);
    this.roomSessions = new Sessions(session);
  }
}
function fixture() {
  const room = createRoom({
    id: 'room-1' as never,
    hostUserId: 'user-1' as UserId,
    visibility: 'PUBLIC',
    durationMinutes: 60,
    createdAt: base,
  });
  const session = createRoomSession({ id: 'session-1' as never, room, startedAt: base });
  const scope = new Scope(room, session);
  const transaction: Transaction = { run: async work => work(scope) };
  const events: DomainEvent[] = [];
  const publisher = {
    publish: async (event: DomainEvent) => {
      events.push(event);
    },
  };
  let n = 0;
  return { room, session, scope, transaction, publisher, ids: { next: () => `generated-${++n}` } };
}
function seed(f: ReturnType<typeof fixture>) {
  const participant = markDisconnected(
    createHostParticipant({
      id: 'old-participant' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'user-1' as UserId,
      joinedAt: base,
    }),
    disconnectedAt
  );
  const participantSession: ParticipantSessionState = {
    ...createParticipantSession({
      id: 'old-session' as never,
      participantId: participant.id,
      connectionId: 'old-connection' as ConnectionId,
      connectedAt: base,
    }),
    disconnectedAt,
    recoverableUntil,
  };
  void f.scope.participants.save(participant);
  void f.scope.participantSessions.save(participantSession);
  return { participant, participantSession };
}

describe('Bug 16 — expired recovery retirement', () => {
  it('keeps a recoverable disconnected participation blocked from JOIN', async () => {
    const f = fixture();
    const { participant } = seed(f);
    const join = new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => new Date('2026-01-01T10:00:10.000Z') },
      f.publisher
    );
    await expect(
      join.execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'new' as ConnectionId })
    ).rejects.toThrow('Use room.reconnect');
    expect(f.scope.participants.values.get(participant.id)?.status).toBe('DISCONNECTED');
  });
  it('retires an expired HOST and permits a fresh HOST JOIN', async () => {
    const f = fixture();
    const { participant, participantSession } = seed(f);
    const join = new JoinRoom(f.transaction, f.ids, { now: () => expiredAt }, f.publisher);
    const joined = await join.execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'new-connection' as ConnectionId,
    });
    expect(joined.managementRole).toBe('HOST');
    expect(joined.participantId).not.toBe(participant.id);
    const retired = f.scope.participants.values.get(participant.id)!;
    expect(retired.status).toBe('LEFT');
    expect(retired.managementRole).toBe('NONE');
    expect(retired.audioRole).toBe('LISTENER');
    const closed = f.scope.participantSessions.values.get(participantSession.id)!;
    expect(closed.status).toBe('CLOSED');
    expect(closed.connectionId).toBeNull();
  });
});
