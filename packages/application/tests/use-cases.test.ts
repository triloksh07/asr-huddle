import { describe, expect, it } from 'vitest';
import { JoinRoom, RequestSpeaker } from '../src/index.js';
import { createRoom, createRoomSession, type ConnectionId } from '@repo/domain';

class MemoryUsers {
  constructor(private readonly user = { id: 'user-1', name: 'Test', avatarUrl: null, bio: null }) {}
  async findById(id: string) {
    return id === this.user.id ? this.user : null;
  }
}

class MemoryRooms {
  private readonly data = new Map<string, ReturnType<typeof createRoom>>();
  async findById(id: string) {
    return this.data.get(id) ?? null;
  }
  async save(room: ReturnType<typeof createRoom>) {
    this.data.set(room.id, room);
  }
}

class MemorySessions {
  private readonly data = new Map<string, ReturnType<typeof createRoomSession>>();
  async findActiveByRoomId(roomId: string) {
    return (
      [...this.data.values()].find(
        session => session.roomId === roomId && session.status === 'ACTIVE'
      ) ?? null
    );
  }
  async save(session: ReturnType<typeof createRoomSession>) {
    this.data.set(session.id, session);
  }
}

class MemoryParticipants {
  private readonly data = new Map<string, any>();
  async findById(id: string) {
    return this.data.get(id) ?? null;
  }
  async findByRoomSession(sessionId: string) {
    return [...this.data.values()].filter(participant => participant.roomSessionId === sessionId);
  }
  async save(participant: any) {
    this.data.set(participant.id, participant);
  }
}

class MemoryParticipantSessions {
  private readonly data = new Map<string, any>();
  async findById(id: string) {
    return this.data.get(id) ?? null;
  }
  async findActiveByParticipantId(participantId: string) {
    return (
      [...this.data.values()].find(
        session => session.participantId === participantId && session.disconnectedAt === null
      ) ?? null
    );
  }
  async save(session: any) {
    this.data.set(session.id, session);
  }
}

class MemoryRequests {
  private readonly data = new Map<string, any>();
  async findById(id: string) {
    return this.data.get(id) ?? null;
  }
  async findPendingByParticipantId(participantId: string) {
    return (
      [...this.data.values()].find(
        request => request.participantId === participantId && request.status === 'PENDING'
      ) ?? null
    );
  }
  async save(request: any) {
    this.data.set(request.id, request);
  }
}

class FixedIds {
  private nextValue = 0;
  next() {
    this.nextValue += 1;
    return `id-${this.nextValue}`;
  }
}

const clock = { now: () => new Date('2026-01-01T10:00:00.000Z') };

describe('application use cases', () => {
  it('joins a user as a listener', async () => {
    const users = new MemoryUsers();
    const rooms = new MemoryRooms();
    const sessions = new MemorySessions();
    const participants = new MemoryParticipants();
    const participantSessions = new MemoryParticipantSessions();

    const room = createRoom({
      id: 'room-1' as any,
      hostUserId: 'host-1' as any,
      visibility: 'PUBLIC',
      durationMinutes: 60,
      createdAt: clock.now(),
    });
    const session = createRoomSession({
      id: 'session-1' as any,
      room,
      startedAt: clock.now(),
    });

    await rooms.save(room);
    await sessions.save(session);

    const participant = await new JoinRoom(
      users,
      rooms,
      sessions,
      participants,
      participantSessions,
      new FixedIds(),
      clock
    ).execute({ roomId: 'room-1', userId: 'user-1', connectionId: 'conn-1' as ConnectionId });

    expect(participant.audioRole).toBe('LISTENER');
    expect(participant.managementRole).toBe('NONE');
  });

  it('creates one pending speaker request and rejects duplicates', async () => {
    const users = new MemoryUsers();
    const rooms = new MemoryRooms();
    const sessions = new MemorySessions();
    const participants = new MemoryParticipants();
    const participantSessions = new MemoryParticipantSessions();
    const requests = new MemoryRequests();

    const room = createRoom({
      id: 'room-1' as any,
      hostUserId: 'host-1' as any,
      visibility: 'PUBLIC',
      durationMinutes: 60,
      createdAt: clock.now(),
    });
    const session = createRoomSession({
      id: 'session-1' as any,
      room,
      startedAt: clock.now(),
    });
    await rooms.save(room);
    await sessions.save(session);

    const participant = await new JoinRoom(
      users,
      rooms,
      sessions,
      participants,
      participantSessions,
      new FixedIds(),
      clock
    ).execute({ roomId: 'room-1', userId: 'user-1', connectionId: 'conn-1' as ConnectionId });

    const useCase = new RequestSpeaker(participants, sessions, requests, new FixedIds(), clock);

    await useCase.execute({ participantId: participant.participantId });
    await expect(useCase.execute({ participantId: participant.participantId })).rejects.toThrow(
      'already pending'
    );
  });
});
