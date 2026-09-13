import type { ConnectionId, UserId } from '@repo/domain';
import { CommandRouter } from './command-router.js';
import { ConnectionRegistry } from './connection-registry.js';
import type { RealtimeConnection, RealtimeResponse, RealtimeTransport } from './types.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';

export interface RealtimeSession {
  readonly connection: RealtimeConnection;
  receive(raw: unknown): Promise<RealtimeResponse>;
  close(code: number, reason: string): Promise<void>;
}

export function createRealtimeSession(
  connectionId: ConnectionId,
  userId: UserId,
  transport: RealtimeTransport,
  router: CommandRouter,
  registry: ConnectionRegistry,
  metrics?: RuntimeMetrics
): RealtimeSession {
  const connection: RealtimeConnection = {
    connectionId,
    userId,
    participantId: null,
    participantSessionId: null,
    roomId: null,
    connectedAt: new Date().toISOString(),
    roomSessionId: null,
  };

  registry.add(Object.assign(connection, { transport }));
  metrics?.recordConnectionOpened();

  return {
    connection,

    async receive(raw: unknown): Promise<RealtimeResponse> {
      const response = await router.dispatch({ connection, transport }, raw);
      metrics?.recordCommand(response.ok);
      await transport.send(response);
      return response;
    },

    async close(code: number, reason: string): Promise<void> {
      registry.remove(connectionId);
      metrics?.recordConnectionClosed();
      await transport.close(code, reason);
    },
  };
}
