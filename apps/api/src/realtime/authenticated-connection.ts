import type { ConnectionId, UserId } from "@repo/domain";
import type { RealtimeConnection, RealtimeTransport } from "./types.js";

export interface AuthenticatedRealtimeConnection {
  connection: RealtimeConnection;
  transport: RealtimeTransport;
}

export interface RealtimeAuthenticator {
  authenticate(request: unknown): Promise<UserId>;
}

export class RejectingRealtimeAuthenticator implements RealtimeAuthenticator {
  async authenticate(_: unknown): Promise<UserId> {
    throw new Error("Realtime authentication is not configured.");
  }
}

export function createAuthenticatedConnection(
  connectionId: ConnectionId,
  userId: UserId,
  transport: RealtimeTransport,
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
