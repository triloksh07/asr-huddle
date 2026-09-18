import { describe, expect, it } from 'vitest';
import {
  DisconnectRoom,
  JoinRoom,
  LeaveRoom,
  ReconnectRoom,
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
  createParticipant,
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

const now = new Date('2026-01-01T10:00:00.000Z');
const later = new Date('2026-01-01T10:00:10.000Z');

class MemoryUsers implements UserRepository {
  constructor(private readonly userId: string) {}

  async findById(userId: string) {
    if (userId !== this.userId) return null;
    return {
      id: this.userId,
      name: 'Test User',
      avatarUrl: null,
      bio: null,
    };
  }
}

class MemoryRooms implements RoomRepository {
  constructor(private readonly room: RoomState) {}

  async findById(roomId: string) {
    return roomId === this.room.id ? this.room : null;
  }

  async findActivePublic() {
    return [this.room];
  }

  async save(_room: RoomState) {}
}

class MemoryRoomSessions implements RoomSessionRepository {
  constructor(private readonly session: RoomSessionState) {}

  async findActiveByRoomId(roomId: string) {
    return roomId === this.session.roomId ? this.session : null;
  }

  async findActive() {
    return [this.session];
  }

  async save(_session: RoomSessionState) {}
}

class MemoryParticipants implements ParticipantRepository {
  readonly values = new Map<string, ParticipantState>();

  async findById(participantId: string) {
    return this.values.get(participantId) ?? null;
  }

  async findByRoomSession(roomSessionId: string) {
    return [...this.values.values()].filter(p => p.roomSessionId === roomSessionId);
  }

  async findByUserAndRoomSession(userId: string, roomSessionId: string) {
    return (
      [...this.values.values()].find(
        p => p.userId === userId && p.roomSessionId === roomSessionId
      ) ?? null
    );
  }

  async findConnectedByUserId(userId: string) {
    return (
      [...this.values.values()].find(
        p => p.userId === userId && p.status === 'CONNECTED'
      ) ?? null
    );
  }

  async save(participant: ParticipantState) {
    this.values.set(participant.id, participant);
  }
}

class MemoryParticipantSessions implements ParticipantSessionRepository {
  readonly values = new Map<string, ParticipantSessionState>();

  async findById(sessionId: string) {
    return this.values.get(sessionId) ?? null;
  }

  async findActiveByParticipantId(participantId: string) {
    return (
      [...this.values.values()].find(
        session => session.participantId === participantId && session.status === 'ACTIVE'
      ) ?? null
    );
  }

  async findByParticipantId(participantId: string) {
    return [...this.values.values()].filter(session => session.participantId === participantId);
  }

  async claimReconnect(
    sessionId: string,
    expectedConnectionId: string,
    connectionId: string,
    connectedAt: Date
  ) {
    const session = this.values.get(sessionId);
    if (
      !session ||
      session.connectionId !== expectedConnectionId ||
      session.disconnectedAt === null
    )
      return null;

    const claimed: ParticipantSessionState = {
      ...session,
      connectionId: connectionId as ConnectionId,
      status: 'ACTIVE',
      connectedAt,
      disconnectedAt: null,
      recoverableUntil: null,
      intentionalLeave: false,
      closedAt: null,
    };

    this.values.set(sessionId, claimed);
    return claimed;
  }

  async save(session: ParticipantSessionState) {
    this.values.set(session.id, session);
  }
}

class MemoryScope implements TransactionScope {
  readonly users: UserRepository;
  readonly rooms: RoomRepository;
  readonly roomSessions: RoomSessionRepository;
  readonly participants: MemoryParticipants;
  readonly participantSessions: MemoryParticipantSessions;

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

  constructor(room: RoomState, session: RoomSessionState, userId: string) {
    this.users = new MemoryUsers(userId);
    this.rooms = new MemoryRooms(room);
    this.roomSessions = new MemoryRoomSessions(session);
    this.participants = new MemoryParticipants();
    this.participantSessions = new MemoryParticipantSessions();
  }
}

function createFixture() {
  const room = createRoom({
    id: 'room-1' as never,
    hostUserId: 'host-1' as UserId,
    visibility: 'PUBLIC',
    durationMinutes: 60,
    createdAt: now,
  });

  const session = createRoomSession({
    id: 'room-session-1' as never,
    room,
    startedAt: now,
  });

  const scope = new MemoryScope(room, session, 'user-1');
  const transaction: Transaction = {
    run: async work => work(scope),
  };

  const events: DomainEvent[] = [];
  const eventPublisher = {
    publish: async (event: DomainEvent) => {
      events.push(event);
    },
  };

  let nextId = 0;
  const ids = {
    next: () => {
      nextId += 1;
      return `generated-${nextId}`;
    },
  };

  return { room, session, scope, transaction, events, eventPublisher, ids };
}

describe('participant session lifecycle', () => {
  it('releases the connection binding on intentional leave and permits a new join', async () => {
    const f = createFixture();

    const join = new JoinRoom(f.transaction, f.ids, { now: () => now }, f.eventPublisher);
    const joined = await join.execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'connection-1' as ConnectionId,
    });

    const leave = new LeaveRoom(f.transaction, { now: () => later }, f.eventPublisher);
    await leave.execute({
      participantId: joined.participantId,
      participantSessionId: joined.participantSessionId,
    });

    const oldSession = f.scope.participantSessions.values.get(joined.participantSessionId);
    expect(oldSession?.intentionalLeave).toBe(true);
    expect(oldSession?.connectionId).toBeNull();
    expect(oldSession?.status).toBe('CLOSED');

    const rejoined = await join.execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'connection-1' as ConnectionId,
    });

    expect(rejoined.participantId).not.toBe(joined.participantId);
    expect(rejoined.participantSessionId).not.toBe(joined.participantSessionId);
  });

  it('retains the old connection binding across temporary disconnect', async () => {
    const f = createFixture();

    const participant = createParticipant({
      id: 'participant-1' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'user-1' as UserId,
      joinedAt: now,
    });
    const participantSession = createParticipantSession({
      id: 'participant-session-1' as never,
      participantId: participant.id,
      connectionId: 'connection-old' as ConnectionId,
      connectedAt: now,
    });

    await f.scope.participants.save(participant);
    await f.scope.participantSessions.save(participantSession);

    const disconnect = new DisconnectRoom(
      f.transaction,
      { now: () => later },
      f.eventPublisher
    );

    expect(
      await disconnect.execute({
        participantId: participant.id,
        participantSessionId: participantSession.id,
        connectionId: 'connection-old',
        recoverableForMs: 30_000,
      })
    ).toBe(true);

    const stored = f.scope.participantSessions.values.get(participantSession.id);
    expect(stored?.connectionId).toBe('connection-old');
    expect(stored?.status).toBe('DISCONNECTED');
    expect(stored?.recoverableUntil).not.toBeNull();
  });

  it('reconnects the existing participant/session and swaps the connection id', async () => {
    const f = createFixture();

    const participant = markDisconnected(
      createParticipant({
        id: 'participant-1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as UserId,
        joinedAt: now,
      }),
      later
    );

    const participantSession = {
      ...createParticipantSession({
        id: 'participant-session-1' as never,
        participantId: participant.id,
        connectionId: 'connection-old' as ConnectionId,
        connectedAt: now,
      }),
      disconnectedAt: later,
      recoverableUntil: new Date(later.getTime() + 30_000),
    };

    await f.scope.participants.save(participant);
    await f.scope.participantSessions.save(participantSession);

    const reconnect = new ReconnectRoom(
      f.transaction,
      { now: () => new Date('2026-01-01T10:00:15.000Z') },
      f.eventPublisher
    );

    const result = await reconnect.execute({
      roomId: f.room.id,
      participantId: participant.id,
      participantSessionId: participantSession.id,
      connectionId: 'connection-new' as ConnectionId,
      userId: 'user-1',
    });

    expect(result.participantId).toBe(participant.id);
    expect(result.participantSessionId).toBe(participantSession.id);

    const stored = f.scope.participantSessions.values.get(participantSession.id);
    expect(stored?.connectionId).toBe('connection-new');
    expect(stored?.status).toBe('ACTIVE');
    expect(f.scope.participants.values.get(participant.id)?.status).toBe('CONNECTED');
  });

  it('rejects a stale reconnect after another connection has reclaimed the session', async () => {
    const f = createFixture();

    const participant = markDisconnected(
      createParticipant({
        id: 'participant-1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as UserId,
        joinedAt: now,
      }),
      later
    );

    const participantSession = {
      ...createParticipantSession({
        id: 'participant-session-1' as never,
        participantId: participant.id,
        connectionId: 'connection-old' as ConnectionId,
        connectedAt: now,
      }),
      disconnectedAt: later,
      recoverableUntil: new Date(later.getTime() + 30_000),
    };

    await f.scope.participants.save(participant);
    await f.scope.participantSessions.save(participantSession);

    const reconnect = new ReconnectRoom(
      f.transaction,
      { now: () => new Date('2026-01-01T10:00:15.000Z') },
      f.eventPublisher
    );

    await reconnect.execute({
      roomId: f.room.id,
      participantId: participant.id,
      participantSessionId: participantSession.id,
      connectionId: 'connection-new' as ConnectionId,
      userId: 'user-1',
    });

    await expect(
      reconnect.execute({
        roomId: f.room.id,
        participantId: participant.id,
        participantSessionId: participantSession.id,
        connectionId: 'connection-stale' as ConnectionId,
        userId: 'user-1',
      })
    ).rejects.toThrow('already reclaimed');
  });

  it('does not allow room.join to bypass a recoverable disconnected participation', async () => {
    const f = createFixture();

    const participant = markDisconnected(
      createParticipant({
        id: 'participant-1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as UserId,
        joinedAt: now,
      }),
      later
    );

    await f.scope.participants.save(participant);

    await expect(
      new JoinRoom(f.transaction, f.ids, { now: () => later }, f.eventPublisher).execute({
        roomId: f.room.id,
        userId: 'user-1',
        connectionId: 'connection-new' as ConnectionId,
      })
    ).rejects.toThrow('Use room.reconnect');
  });

  it('allows a removed participant to create a fresh participation', async () => {
    const f = createFixture();

    const removed: ParticipantState = {
      ...createParticipant({
        id: 'participant-1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as UserId,
        joinedAt: now,
      }),
      status: 'REMOVED',
      removedAt: later,
    };

    await f.scope.participants.save(removed);

    const joined = await new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => later },
      f.eventPublisher
    ).execute({
      roomId: f.room.id,
      userId: 'user-1',
      connectionId: 'connection-new' as ConnectionId,
    });

    expect(joined.participantId).not.toBe(removed.id);
  });
});
