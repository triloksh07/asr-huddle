import type { ConnectionId, ParticipantId, UserId } from "@repo/domain";
import type { RealtimeConnection, RealtimeTransport } from "./types.js";

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

  remove(connectionId: ConnectionId): RegisteredConnection | null {
    const existing = this.connections.get(connectionId) ?? null;
    this.connections.delete(connectionId);
    return existing;
  }

  size(): number {
    return this.connections.size;
  }
}
