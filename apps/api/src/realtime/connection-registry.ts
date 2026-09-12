import type { ConnectionId, ParticipantId, UserId, RoomId } from '@repo/domain';
import type { RealtimeConnection, RealtimeServerMessage, RealtimeTransport } from './types.js';

export interface RegisteredConnection extends RealtimeConnection {
  transport: RealtimeTransport;
}

export class ConnectionRegistry {
  private readonly connections = new Map<string, RegisteredConnection>();

  add(connection: RegisteredConnection): void {
    this.connections.set(connection.connectionId, connection);
  }

  get(connectionId: ConnectionId): RegisteredConnection | null {
    return this.connections.get(connectionId) ?? null;
  }

  getByUser(userId: UserId): RegisteredConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.userId === userId) return connection;
    }
    return null;
  }

  getByParticipant(participantId: ParticipantId): RegisteredConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.participantId === participantId) return connection;
    }
    return null;
  }

  getByRoom(roomId: RoomId): readonly RegisteredConnection[] {
    return [...this.connections.values()].filter(connection => connection.roomId === roomId);
  }

  async broadcastRoom(
    roomId: RoomId,
    message: RealtimeServerMessage,
    exceptConnectionId?: ConnectionId,
  ): Promise<void> {
    await Promise.all(
      this.getByRoom(roomId)
        .filter(connection => connection.connectionId !== exceptConnectionId)
        .map(connection => connection.transport.send(message)),
    );
  }

  async closeParticipant(
    participantId: ParticipantId,
    code = 4003,
    reason = 'Removed from room',
  ): Promise<void> {
    const connection = this.getByParticipant(participantId);
    if (!connection) return;
    this.connections.delete(connection.connectionId);
    await connection.transport.close(code, reason);
  }

  remove(connectionId: ConnectionId): RegisteredConnection | null {
    const existing = this.connections.get(connectionId) ?? null;
    this.connections.delete(connectionId);
    return existing;
  }

  size(): number {
    return this.connections.size;
  }
}
