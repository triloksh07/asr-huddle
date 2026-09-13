import type { ConnectionId } from '@repo/domain';
import type { DisconnectRoom } from '@repo/application';
import { randomUUID } from 'node:crypto';
import { CommandRouter } from './command-router.js';
import { ConnectionRegistry } from './connection-registry.js';
import {
  createAuthenticatedConnection,
  type RealtimeAuthenticator,
} from './authenticated-connection.js';
import { createRealtimeSession } from './ws-session.js';
import type { RealtimeTransport } from './types.js';
import type { MediaController } from '../media/media-controller.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (error: unknown) => void): void;
}

export interface RealtimeRuntime {
  accept(socket: WebSocketLike, request: unknown): Promise<void>;
}

const DEFAULT_MAX_MESSAGE_BYTES = 65_536;
const DEFAULT_MAX_PROTOCOL_VIOLATIONS = 5;

function decodeMessage(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data) && data.every(item => Buffer.isBuffer(item))) {
    return Buffer.concat(data).toString('utf8');
  }
  return null;
}

export function createRealtimeRuntime(
  router: CommandRouter,
  registry: ConnectionRegistry,
  authenticator: RealtimeAuthenticator,
  disconnectRoom: DisconnectRoom,
  _media: MediaController,
  disconnectRecoveryMs: number,
  metrics?: RuntimeMetrics,
  logger?: StructuredLogger,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
  maxProtocolViolations = DEFAULT_MAX_PROTOCOL_VIOLATIONS
): RealtimeRuntime {
  if (!Number.isInteger(maxMessageBytes) || maxMessageBytes < 1) {
    throw new Error('maxMessageBytes must be a positive integer.');
  }
  if (!Number.isInteger(maxProtocolViolations) || maxProtocolViolations < 1) {
    throw new Error('maxProtocolViolations must be a positive integer.');
  }

  return {
    async accept(socket, request) {
      const userId = await authenticator.authenticate(request);
      const connectionId = randomUUID() as ConnectionId;
      const transport: RealtimeTransport = {
        async send(message) {
          socket.send(JSON.stringify(message));
        },
        async close(code, reason) {
          socket.close(code, reason);
        },
      };

      const authenticated = createAuthenticatedConnection(connectionId, userId, transport);
      const session = createRealtimeSession(
        authenticated.connection.connectionId,
        authenticated.connection.userId,
        authenticated.transport,
        router,
        registry,
        metrics
      );

      logger?.info('realtime_connection_opened', { connectionId, userId });

      let finalized = false;
      let protocolViolations = 0;

      const closeForProtocolViolation = async (code: string, reason: string) => {
        protocolViolations += 1;
        await transport.send({
          requestId: 'unknown',
          type: 'error',
          ok: false,
          error: { code, message: reason },
        });
        if (protocolViolations >= maxProtocolViolations) {
          await transport.close(1008, 'Protocol violation limit exceeded.');
        }
      };

      const finalizeConnection = async () => {
        if (finalized) return;
        finalized = true;

        const registered = registry.get(connectionId);
        if (!registered) return;

        const { roomId, roomSessionId, participantId, participantSessionId } = registered;

        if (roomId && roomSessionId && participantId && participantSessionId) {
          try {
            await disconnectRoom.execute({
              participantId,
              participantSessionId,
              connectionId,
              recoverableForMs: disconnectRecoveryMs,
            });
          } catch (error) {
            logger?.error('realtime_disconnect_persist_failed', {
              connectionId,
              error: error instanceof Error ? error.message : 'unknown',
            });
          }
        }

        registry.remove(connectionId);
        metrics?.recordConnectionClosed();
        logger?.info('realtime_connection_closed', { connectionId, userId });
      };

      socket.on('message', async data => {
        const message = decodeMessage(data);
        if (message === null) {
          await closeForProtocolViolation(
            'INVALID_MESSAGE',
            'Message must be valid text or binary JSON.'
          );
          return;
        }

        const size = Buffer.byteLength(message, 'utf8');
        if (size > maxMessageBytes) {
          await transport.send({
            requestId: 'unknown',
            type: 'error',
            ok: false,
            error: {
              code: 'MESSAGE_TOO_LARGE',
              message: 'Realtime message exceeds the maximum allowed size.',
            },
          });
          await transport.close(1009, 'Message too large.');
          return;
        }

        let raw: unknown;
        try {
          raw = JSON.parse(message) as unknown;
        } catch {
          await closeForProtocolViolation('INVALID_MESSAGE', 'Message must contain valid JSON.');
          return;
        }

        try {
          const response = await session.receive(raw);
          if (response.error && router.isProtocolViolation(response.error.code)) {
            protocolViolations += 1;
            if (protocolViolations >= maxProtocolViolations) {
              await transport.close(1008, 'Protocol violation limit exceeded.');
            }
          }
        } catch {
          await closeForProtocolViolation('INVALID_MESSAGE', 'Unable to process realtime message.');
        }
      });

      socket.on('close', () => void finalizeConnection());
      socket.on('error', () => void finalizeConnection());
    },
  };
}
