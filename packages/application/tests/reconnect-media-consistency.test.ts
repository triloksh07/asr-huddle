import { describe, expect, it } from 'vitest';
import {
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

function fixture() {
  const room = createRoom({
    id: 'room-1' as never,
    hostUserId: 'host-user' as UserId,
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

async function reconnectWith(overrides: Partial<ParticipantState>) {
  const f = fixture();
  const p = {
    ...createParticipant({
      id: 'participant' as never,
      roomId: f.room.id,
      roomSessionId: f.session.id,
      userId: 'participant-user' as UserId,
      joinedAt: now,
    }),
    ...overrides,
  };
  await f.participants.save(markDisconnected(p, disconnectedAt));
  await f.participantSessions.save(disconnectedSession(p.id));
  const result = await new ReconnectRoom(
    f.transaction,
    { now: () => reconnectAt },
    f.publisher
  ).execute({
    roomId: f.room.id,
    participantId: p.id,
    participantSessionId: `session-${p.id}`,
    connectionId: 'new-connection' as ConnectionId,
    userId: 'participant-user',
  });
  return { f, result };
}

describe('reconnect preserves logical audio state', () => {
  it.each([
    ['speaker remains unmuted', { audioRole: 'SPEAKER', selfMuted: false, moderatorMuted: false }],
    ['self-muted speaker', { audioRole: 'SPEAKER', selfMuted: true, moderatorMuted: false }],
    ['moderator-muted speaker', { audioRole: 'SPEAKER', selfMuted: false, moderatorMuted: true }],
    ['listener', { audioRole: 'LISTENER', selfMuted: false, moderatorMuted: false }],
  ])('preserves %s across reconnect', async (_name, overrides) => {
    const { f, result } = await reconnectWith(overrides as Partial<ParticipantState>);
    expect(result).toMatchObject(overrides);
    expect(f.participants.values.get('participant')).toMatchObject({
      status: 'CONNECTED',
      ...overrides,
    });
  });
});
