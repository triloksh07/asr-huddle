import { describe, expect, it } from 'vitest';
import {
  DelegateHost,
  ReconnectRoom,
  type DomainEvent,
  type ParticipantRepository,
  type ParticipantSessionRepository,
  type RoomRepository,
  type RoomSessionRepository,
  type Transaction,
  type TransactionScope,
  type UserRepository,
} from '@repo/application';
import {
  createHostParticipant,
  createParticipant,
  createParticipantSession,
  createRoom,
  createRoomSession,
  markDisconnected,
  type ConnectionId,
  type ParticipantSessionState,
  type ParticipantState,
  type RoomState,
  type RoomSessionState,
  type UserId,
} from '@repo/domain';

const now = new Date('2026-01-01T10:00:00.000Z');
const disconnectedAt = new Date('2026-01-01T10:00:01.000Z');
const reconnectAt = new Date('2026-01-01T10:00:10.000Z');

class Participants implements ParticipantRepository {
  readonly values = new Map<string, ParticipantState>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findByRoomSession(id: string) {
    return [...this.values.values()].filter(p => p.roomSessionId === id);
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
      [...this.values.values()].find(p => p.userId === userId && p.status === 'CONNECTED') ?? null
    );
  }
  async save(p: ParticipantState) {
    this.values.set(p.id, p);
  }
}

class Sessions implements ParticipantSessionRepository {
  readonly values = new Map<string, ParticipantSessionState>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findActiveByParticipantId(id: string) {
    return (
      [...this.values.values()].find(
        s =>
          s.participantId === id &&
          s.connectionId !== null &&
          s.disconnectedAt === null &&
          !s.intentionalLeave
      ) ?? null
    );
  }
  async findByParticipantId(id: string) {
    return [...this.values.values()].filter(s => s.participantId === id);
  }
  async claimReconnect(
    sessionId: string,
    expectedConnectionId: string,
    connectionId: string,
    connectedAt: Date
  ) {
    const current = this.values.get(sessionId);
    if (
      !current ||
      current.connectionId !== expectedConnectionId ||
      current.disconnectedAt === null ||
      current.intentionalLeave
    )
      return null;

    const claimed: ParticipantSessionState = {
      ...current,
      connectionId: connectionId as ConnectionId,
      connectedAt,
      disconnectedAt: null,
      recoverableUntil: null,
      intentionalLeave: false,
    };
    this.values.set(sessionId, claimed);
    return claimed;
  }
  async save(s: ParticipantSessionState) {
    this.values.set(s.id, s);
  }
}

class Users implements UserRepository {
  async findById(id: string) {
    return { id, name: 'User', avatarUrl: null, bio: null };
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
class RoomSessions implements RoomSessionRepository {
  constructor(private readonly session: RoomSessionState) {}
  async findActiveByRoomId(id: string) {
    return id === this.session.roomId ? this.session : null;
  }
  async findActive() {
    return [this.session];
  }
  async save(_session: RoomSessionState) {}
}

function fixture(hostUserId = 'host-user') {
  const room = createRoom({
    id: 'room-1' as never,
    hostUserId: hostUserId as UserId,
    visibility: 'PUBLIC',
    durationMinutes: 60,
    createdAt: now,
  });
  const session = createRoomSession({ id: 'room-session-1' as never, room, startedAt: now });
  const participants = new Participants();
  const participantSessions = new Sessions();
  const scope: TransactionScope = {
    users: new Users(),
    rooms: new Rooms(room),
    roomSessions: new RoomSessions(session),
    participants,
    participantSessions,
    speakerRequests: {
      findById: async () => null,
      findPendingByParticipantId: async () => null,
      save: async () => {},
    },
    invitations: {
      findById: async () => null,
      findPendingByParticipantId: async () => null,
      save: async () => {},
    },
  };
  const transaction: Transaction = { run: async work => work(scope) };
  const events: DomainEvent[] = [];
  const publisher = {
    publish: async (event: DomainEvent) => {
      events.push(event);
    },
  };
  return { room, session, participants, participantSessions, transaction, events, publisher };
}

function disconnectedSession(participantId: string) {
  return {
    ...createParticipantSession({
      id: `session-${participantId}` as never,
      participantId: participantId as never,
      connectionId: `old-${participantId}` as ConnectionId,
      connectedAt: now,
    }),
    disconnectedAt,
    recoverableUntil: new Date(reconnectAt.getTime() + 30_000),
  };
}

describe('Group 5 Part 1 — reconnect and CO_HOST delegation', () => {
  it('delegates only CO_HOST on HOST disconnect and prefers an eligible speaker', async () => {
    const f = fixture();
    const host = createHostParticipant({
      id: 'host' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'host-user' as UserId,
      joinedAt: now,
    });
    const speaker = {
      ...createParticipant({
        id: 'speaker' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'speaker-user' as UserId,
        joinedAt: new Date(now.getTime() + 1000),
      }),
      audioRole: 'SPEAKER' as const,
    };
    const listener = createParticipant({
      id: 'listener' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'listener-user' as UserId,
      joinedAt: new Date(now.getTime() + 2000),
    });
    await f.participants.save(host);
    await f.participants.save(speaker);
    await f.participants.save(listener);

    const result = await new DelegateHost(
      f.participants,
      { now: () => reconnectAt },
      f.publisher
    ).execute({
      roomSessionId: f.session.id,
      previousHostParticipantId: host.id,
    });

    expect(result?.id).toBe(speaker.id);
    expect(f.participants.values.get(speaker.id)?.managementRole).toBe('CO_HOST');
    expect(f.participants.values.get(speaker.id)?.audioRole).toBe('SPEAKER');
    expect(f.participants.values.get(listener.id)?.managementRole).toBe('NONE');
    expect(f.participants.values.get(host.id)?.managementRole).toBe('HOST');
    expect(f.events.at(-1)?.payload).toEqual(
      expect.objectContaining({
        managementRole: 'CO_HOST',
        audioRole: 'SPEAKER',
        reason: 'HOST_DELEGATION',
      })
    );
  });

  it('does not create another CO_HOST when one is already connected', async () => {
    const f = fixture();
    const existing = {
      ...createParticipant({
        id: 'cohost' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'cohost-user' as UserId,
        joinedAt: now,
      }),
      managementRole: 'CO_HOST' as const,
      audioRole: 'SPEAKER' as const,
    };
    const eligible = createParticipant({
      id: 'eligible' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'eligible-user' as UserId,
      joinedAt: new Date(now.getTime() + 1000),
    });
    await f.participants.save(existing);
    await f.participants.save(eligible);

    expect(
      await new DelegateHost(f.participants, { now: () => reconnectAt }, f.publisher).execute({
        roomSessionId: f.session.id,
        previousHostParticipantId: 'host',
      })
    ).toBeNull();
    expect(f.participants.values.get(eligible.id)?.managementRole).toBe('NONE');
    expect(f.events).toHaveLength(0);
  });

  it('restores the original HOST after reconnect while preserving the delegated CO_HOST', async () => {
    const f = fixture();
    const host = markDisconnected(
      createHostParticipant({
        id: 'host' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'host-user' as UserId,
        joinedAt: now,
      }),
      disconnectedAt
    );
    const coHost = {
      ...createParticipant({
        id: 'cohost' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'cohost-user' as UserId,
        joinedAt: new Date(now.getTime() + 1000),
      }),
      managementRole: 'CO_HOST' as const,
      audioRole: 'SPEAKER' as const,
    };
    await f.participants.save(host);
    await f.participants.save(coHost);
    await f.participantSessions.save(disconnectedSession(host.id));

    const result = await new ReconnectRoom(
      f.transaction,
      { now: () => reconnectAt },
      f.publisher
    ).execute({
      roomId: f.room.id,
      participantId: host.id,
      participantSessionId: 'session-host',
      connectionId: 'new-host-connection' as ConnectionId,
      userId: 'host-user',
    });

    expect(result.managementRole).toBe('HOST');
    expect(result.audioRole).toBe('SPEAKER');
    expect(f.participants.values.get(host.id)?.status).toBe('CONNECTED');
    expect(f.participants.values.get(host.id)?.managementRole).toBe('HOST');
    expect(f.participants.values.get(coHost.id)?.managementRole).toBe('CO_HOST');
    expect(f.events.at(-1)?.type).toBe('participant.reconnected');
  });

  it('keeps the delegated CO_HOST when the original HOST reconnects after delegation', async () => {
    const f = fixture();
    const host = markDisconnected(
      createHostParticipant({
        id: 'host' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'host-user' as UserId,
        joinedAt: now,
      }),
      disconnectedAt
    );
    const participant = {
      ...createParticipant({
        id: 'participant' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'participant-user' as UserId,
        joinedAt: new Date(now.getTime() + 1000),
      }),
      audioRole: 'SPEAKER' as const,
    };
    await f.participants.save(host);
    await f.participants.save(participant);
    await f.participantSessions.save(disconnectedSession(host.id));

    await new DelegateHost(f.participants, { now: () => disconnectedAt }, f.publisher).execute({
      roomSessionId: f.session.id,
      previousHostParticipantId: host.id,
    });
    expect(f.participants.values.get(participant.id)?.managementRole).toBe('CO_HOST');

    await new ReconnectRoom(f.transaction, { now: () => reconnectAt }, f.publisher).execute({
      roomId: f.room.id,
      participantId: host.id,
      participantSessionId: 'session-host',
      connectionId: 'new-host-connection' as ConnectionId,
      userId: 'host-user',
    });

    expect(f.participants.values.get(host.id)?.managementRole).toBe('HOST');
    expect(f.participants.values.get(participant.id)?.managementRole).toBe('CO_HOST');
  });
});
