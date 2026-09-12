import { describe, expect, it } from 'vitest';
import { EndRoom, ProcessRoomLifecycle, type DomainEvent } from '../src/index.js';
import {
  createParticipant,
  createParticipantSession,
  createRoom,
  createRoomSession,
  markDisconnected,
  markLeft,
  markSessionDisconnected,
} from '@repo/domain';

class MemoryRooms {
  readonly values = new Map<string, ReturnType<typeof createRoom>>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async save(value: ReturnType<typeof createRoom>) {
    this.values.set(value.id, value);
  }
}

class MemoryRoomSessions {
  readonly values = new Map<string, ReturnType<typeof createRoomSession>>();
  async findActiveByRoomId(roomId: string) {
    return (
      [...this.values.values()].find(
        value => value.roomId === roomId && value.status === 'ACTIVE'
      ) ?? null
    );
  }
  async findActive() {
    return [...this.values.values()].filter(value => value.status === 'ACTIVE');
  }
  async save(value: ReturnType<typeof createRoomSession>) {
    this.values.set(value.id, value);
  }
}

class MemoryParticipants {
  readonly values = new Map<string, ReturnType<typeof createParticipant>>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findByRoomSession(roomSessionId: string) {
    return [...this.values.values()].filter(value => value.roomSessionId === roomSessionId);
  }
  async findByUserAndRoomSession() {
    return null;
  }
  async save(value: ReturnType<typeof createParticipant>) {
    this.values.set(value.id, value);
  }
}

class MemoryParticipantSessions {
  readonly values = new Map<string, ReturnType<typeof createParticipantSession>>();
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findActiveByParticipantId() {
    return null;
  }
  async findByParticipantId(participantId: string) {
    return [...this.values.values()].filter(value => value.participantId === participantId);
  }
  async save(value: ReturnType<typeof createParticipantSession>) {
    this.values.set(value.id, value);
  }
}

const ids = { next: () => 'unused' };
const at = (value: string) => ({ now: () => new Date(value) });

function fixture() {
  const rooms = new MemoryRooms();
  const sessions = new MemoryRoomSessions();
  const participants = new MemoryParticipants();
  const participantSessions = new MemoryParticipantSessions();
  const events: DomainEvent[] = [];
  const publish = {
    publish: async (event: DomainEvent) => {
      events.push(event);
    },
  };
  const room = createRoom({
    id: 'room-1' as never,
    hostUserId: 'user-1' as never,
    visibility: 'PUBLIC',
    durationMinutes: 60,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
  });
  const session = createRoomSession({
    id: 'session-1' as never,
    room,
    startedAt: new Date('2026-01-01T10:00:00.000Z'),
  });
  return { rooms, sessions, participants, participantSessions, events, publish, room, session };
}

describe('ProcessRoomLifecycle', () => {
  it('issues one durable five-minute warning', async () => {
    const f = fixture();
    await f.rooms.save(f.room);
    await f.sessions.save(f.session);
    const lifecycle = new ProcessRoomLifecycle(
      f.sessions,
      f.participants,
      f.participantSessions,
      new EndRoom(f.rooms, f.sessions, at('2026-01-01T10:55:00.000Z'), f.publish),
      at('2026-01-01T10:55:00.000Z'),
      f.publish
    );
    await lifecycle.execute();
    await lifecycle.execute();
    expect(f.events.filter(event => event.type === 'room.expiry.warning')).toHaveLength(1);
    expect(f.sessions.values.get('session-1')?.expiryWarningIssuedAt).not.toBeNull();
  });

  it('ends an expired room with an expiry reason', async () => {
    const f = fixture();
    await f.rooms.save(f.room);
    await f.sessions.save(f.session);
    const lifecycle = new ProcessRoomLifecycle(
      f.sessions,
      f.participants,
      f.participantSessions,
      new EndRoom(f.rooms, f.sessions, at('2026-01-01T11:00:00.000Z'), f.publish),
      at('2026-01-01T11:00:00.000Z'),
      f.publish
    );
    const result = await lifecycle.execute();
    expect(result.endedRooms).toEqual([
      { roomId: 'room-1', roomSessionId: 'session-1', reason: 'EXPIRY' },
    ]);
    expect(f.events.find(event => event.type === 'room.ended')?.payload).toEqual({
      reason: 'EXPIRY',
    });
  });

  it('does not end an otherwise empty room while a disconnect remains recoverable', async () => {
    const f = fixture();
    await f.rooms.save(f.room);
    await f.sessions.save(f.session);
    const participant = markDisconnected(
      createParticipant({
        id: 'participant-1' as never,
        roomId: f.room.id,
        roomSessionId: f.session.id,
        userId: 'user-1' as never,
        joinedAt: new Date('2026-01-01T10:00:00.000Z'),
      }),
      new Date('2026-01-01T10:30:00.000Z')
    );
    const participantSession = markSessionDisconnected(
      createParticipantSession({
        id: 'participant-session-1' as never,
        participantId: participant.id,
        connectionId: 'connection-1' as never,
        connectedAt: new Date('2026-01-01T10:00:00.000Z'),
      }),
      new Date('2026-01-01T10:30:00.000Z'),
      new Date('2026-01-01T10:31:00.000Z')
    );
    await f.participants.save(participant);
    await f.participantSessions.save(participantSession);
    const lifecycle = new ProcessRoomLifecycle(
      f.sessions,
      f.participants,
      f.participantSessions,
      new EndRoom(f.rooms, f.sessions, at('2026-01-01T10:30:30.000Z'), f.publish),
      at('2026-01-01T10:30:30.000Z'),
      f.publish
    );
    expect((await lifecycle.execute()).endedRooms).toEqual([]);
  });

  it('ends a room once its final participant has intentionally left', async () => {
    const f = fixture();
    await f.rooms.save(f.room);
    await f.sessions.save(f.session);
    await f.participants.save(
      markLeft(
        createParticipant({
          id: 'participant-1' as never,
          roomId: f.room.id,
          roomSessionId: f.session.id,
          userId: 'user-1' as never,
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
        }),
        new Date('2026-01-01T10:30:00.000Z')
      )
    );
    const lifecycle = new ProcessRoomLifecycle(
      f.sessions,
      f.participants,
      f.participantSessions,
      new EndRoom(f.rooms, f.sessions, at('2026-01-01T10:30:00.000Z'), f.publish),
      at('2026-01-01T10:30:00.000Z'),
      f.publish
    );
    expect((await lifecycle.execute()).endedRooms[0]?.reason).toBe('EMPTY');
  });
});
