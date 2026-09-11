import type { ConnectionId, UserId } from '@repo/domain';
import { CommandRouter } from './command-router.js';
import { ConnectionRegistry } from './connection-registry.js';
import type { RealtimeConnection, RealtimeTransport } from './types.js';

export interface RealtimeSession {
  readonly connection: RealtimeConnection;
  receive(raw: unknown): Promise<void>;
  close(code: number, reason: string): Promise<void>;
}

export function createRealtimeSession(
  connectionId: ConnectionId,
  userId: UserId,
  transport: RealtimeTransport,
  router: CommandRouter,
  registry: ConnectionRegistry
): RealtimeSession {
  const connection: RealtimeConnection = {
    connectionId,
    userId,
    participantId: null,
    participantSessionId: null,
    roomId: null,
    connectedAt: new Date().toISOString(),
    roomSessionId: null
  };

  registry.add(Object.assign(connection, { transport }));

  return {
    connection,

    async receive(raw: unknown): Promise<void> {
      const response = await router.dispatch({ connection, transport }, raw);
      await transport.send(response);
    },

    async close(code: number, reason: string): Promise<void> {
      registry.remove(connectionId);
      await transport.close(code, reason);
    },
  };
}
