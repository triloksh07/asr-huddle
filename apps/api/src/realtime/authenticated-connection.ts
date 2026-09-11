import type { IncomingMessage } from 'node:http';
import type { ConnectionId, UserId } from '@repo/domain';
import type { UserRepository } from '@repo/application';
import type { RealtimeConnection, RealtimeTransport } from './types.js';

export interface AuthenticatedRealtimeConnection {
  connection: RealtimeConnection;
  transport: RealtimeTransport;
}

export interface RealtimeAuthenticator {
  authenticate(request: unknown): Promise<UserId>;
}

export class RejectingRealtimeAuthenticator implements RealtimeAuthenticator {
  async authenticate(_: unknown): Promise<UserId> {
    throw new Error('Realtime authentication is not configured.');
  }
}

/**
 * Development-only adapter used by the local runtime test harness.
 * Production authentication must provide a real RealtimeAuthenticator.
 */
export class DevelopmentQueryAuthenticator implements RealtimeAuthenticator {
  constructor(private readonly users: UserRepository) {}

  async authenticate(request: unknown): Promise<UserId> {
    const incoming = request as IncomingMessage;
    const url = new URL(incoming.url ?? '/', 'ws://localhost');
    const value = url.searchParams.get('userId');

    if (!value) {
      throw new Error('Authentication requires ?userId=...');
    }

    const user = await this.users.findById(value);
    if (!user) {
      throw new Error('Authenticated user was not found.');
    }

    return user.id as UserId;
  }
}

export function createAuthenticatedConnection(
  connectionId: ConnectionId,
  userId: UserId,
  transport: RealtimeTransport
): AuthenticatedRealtimeConnection {
  return {
    connection: {
      connectionId,
      userId,
      participantId: null,
      participantSessionId: null,
      roomId: null,
      connectedAt: new Date().toISOString(),
    },
    transport,
  };
}
