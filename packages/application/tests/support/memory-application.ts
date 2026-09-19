import type { DomainEvent, ParticipantRepository, ParticipantSessionRepository, RoomRepository, RoomSessionRepository, Transaction, TransactionScope, UserRepository } from '../../src/index.js';
import type { ConnectionId, ParticipantSessionState, ParticipantState, RoomSessionState, RoomState, UserId } from '@repo/domain';
import { createRoom, createRoomSession } from '@repo/domain';

export const base = new Date('2026-01-01T10:00:00.000Z');

export class MemoryUsers implements UserRepository {
  private readonly values = new Map<string, { id: string; name: string; avatarUrl: string | null; bio: string | null }>();
  add(user: { id: string; name: string; avatarUrl: string | null; bio: string | null }) { this.values.set(user.id, user); }
  async findById(id: string) { return this.values.get(id) ?? null; }
}
export class MemoryRooms implements RoomRepository {
  readonly values = new Map<string, RoomState>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findActivePublic() { return [...this.values.values()].filter(r => r.status === 'ACTIVE' && r.visibility === 'PUBLIC'); }
  async save(room: RoomState) { this.values.set(room.id, room); }
}
export class MemoryRoomSessions implements RoomSessionRepository {
  readonly values = new Map<string, RoomSessionState>();
  async findActiveByRoomId(roomId: string) { return [...this.values.values()].find(s => s.roomId === roomId && s.status === 'ACTIVE') ?? null; }
  async findActive() { return [...this.values.values()].filter(s => s.status === 'ACTIVE'); }
  async save(session: RoomSessionState) { this.values.set(session.id, session); }
}
export class MemoryParticipants implements ParticipantRepository {
  readonly values = new Map<string, ParticipantState>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findByRoomSession(roomSessionId: string) { return [...this.values.values()].filter(p => p.roomSessionId === roomSessionId); }
  async findByUserAndRoomSession(userId: string, roomSessionId: string) { return [...this.values.values()].find(p => p.userId === userId && p.roomSessionId === roomSessionId) ?? null; }
  async findConnectedByUserId(userId: string) { return [...this.values.values()].find(p => p.userId === userId && p.status === 'CONNECTED') ?? null; }
  async save(participant: ParticipantState) { this.values.set(participant.id, participant); }
}
export class MemoryParticipantSessions implements ParticipantSessionRepository {
  readonly values = new Map<string, ParticipantSessionState>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findActiveByParticipantId(participantId: string) { return [...this.values.values()].find(s => s.participantId === participantId && s.disconnectedAt === null && s.connectionId !== null && !s.intentionalLeave) ?? null; }
  async findByParticipantId(participantId: string) { return [...this.values.values()].filter(s => s.participantId === participantId); }
  async claimReconnect(sessionId: string, expectedConnectionId: string, connectionId: string, connectedAt: Date) {
    const s = this.values.get(sessionId);
    if (!s || s.connectionId !== expectedConnectionId || s.disconnectedAt === null) return null;
    const claimed: ParticipantSessionState = { ...s, connectionId: connectionId as ConnectionId, connectedAt, disconnectedAt: null, recoverableUntil: null, intentionalLeave: false };
    this.values.set(sessionId, claimed);
    return claimed;
  }
  async save(session: ParticipantSessionState) { this.values.set(session.id, session); }
}
export class MemorySpeakerRequests {
  readonly values = new Map<string, any>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findPendingByParticipantId(id: string) { return [...this.values.values()].find(r => r.participantId === id && r.status === 'PENDING') ?? null; }
  async save(value: any) { this.values.set(value.id, value); }
}
export class MemoryInvitations {
  readonly values = new Map<string, any>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findPendingByParticipantId(id: string) { return [...this.values.values()].find(i => i.targetParticipantId === id && i.status === 'PENDING') ?? null; }
  async save(value: any) { this.values.set(value.id, value); }
}
export class FixedIds { private n = 0; next() { return `generated-${++this.n}`; } }

export function applicationFixture(userId = 'user-1') {
  const users = new MemoryUsers(); users.add({ id: userId, name: 'Test User', avatarUrl: null, bio: null });
  const rooms = new MemoryRooms();
  const room = createRoom({ id: 'room-1' as never, hostUserId: 'host-1' as UserId, visibility: 'PUBLIC', durationMinutes: 60, createdAt: base });
  void rooms.save(room);
  const roomSessions = new MemoryRoomSessions();
  const session = createRoomSession({ id: 'room-session-1' as never, room, startedAt: base });
  void roomSessions.save(session);
  const participants = new MemoryParticipants();
  const participantSessions = new MemoryParticipantSessions();
  const speakerRequests = new MemorySpeakerRequests();
  const invitations = new MemoryInvitations();
  const scope: TransactionScope = { users, rooms, roomSessions, participants, participantSessions, speakerRequests, invitations };
  const transaction: Transaction = { run: async work => work(scope) };
  const events: DomainEvent[] = [];
  const eventPublisher = { publish: async (event: DomainEvent) => { events.push(event); } };
  return { users, rooms, roomSessions, participants, participantSessions, speakerRequests, invitations, scope, transaction, room, session, events, eventPublisher, ids: new FixedIds() };
}
