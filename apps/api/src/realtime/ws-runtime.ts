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
import { RateLimitInfrastructureError } from '../security/rate-limiter.js';
import type { RateLimitRule, RateLimiter } from '../security/rate-limiter.js';

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

function clientAddressFromRequest(request: unknown): string {
  if (typeof request !== 'object' || request === null || !('socket' in request)) {
    return 'unknown';
  }

  const socket = request.socket;
  if (
    typeof socket !== 'object' ||
    socket === null ||
    !('remoteAddress' in socket) ||
    typeof socket.remoteAddress !== 'string' ||
    socket.remoteAddress.length === 0
  ) {
    return 'unknown';
  }

  return socket.remoteAddress;
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
  maxProtocolViolations = DEFAULT_MAX_PROTOCOL_VIOLATIONS,
  rateLimiter?: RateLimiter,
  connectionRateLimit?: RateLimitRule
): RealtimeRuntime {
  if (!Number.isInteger(maxMessageBytes) || maxMessageBytes < 1) {
    throw new Error('maxMessageBytes must be a positive integer.');
  }
  if (!Number.isInteger(maxProtocolViolations) || maxProtocolViolations < 1) {
    throw new Error('maxProtocolViolations must be a positive integer.');
  }

  return {
    async accept(socket, request) {
      if (rateLimiter && connectionRateLimit) {
        try {
          const decision = await rateLimiter.consume(
            'realtime.connection',
            clientAddressFromRequest(request),
            connectionRateLimit
          );
          if (!decision.allowed) {
            socket.close(1008, 'Connection rate limit exceeded.');
            return;
          }
        } catch (error) {
          if (error instanceof RateLimitInfrastructureError) {
            socket.close(1013, 'Realtime protection is temporarily unavailable.');
            return;
          }
          throw error;
        }
      }

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
        metrics,
        logger
      );

      logger?.info('realtime_connection_opened', { connectionId, userId });

      let finalized = false;
      let protocolViolations = 0;

      const closeForProtocolViolation = async (code: string, reason: string) => {
        protocolViolations += 1;
        metrics?.recordProtocolViolation();

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

      const persistDisconnect = async (
        participantId: Parameters<DisconnectRoom['execute']>[0]['participantId'],
        participantSessionId: Parameters<DisconnectRoom['execute']>[0]['participantSessionId']
      ): Promise<void> => {
        const retryDelaysMs = [250, 500, 1_000, 2_000, 5_000] as const;

        for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
          try {
            const disconnected = await disconnectRoom.execute({
              participantId,
              participantSessionId,
              connectionId,
              recoverableForMs: disconnectRecoveryMs,
            });

            if (disconnected) {
              const mediaRetryDelaysMs = [250, 500, 1_000, 2_000, 5_000] as const;
              for (
                let mediaAttempt = 0;
                mediaAttempt <= mediaRetryDelaysMs.length;
                mediaAttempt += 1
              ) {
                try {
                  const registered = registry.get(connectionId);
                  const roomId = registered?.roomId;
                  const roomSessionId = registered?.roomSessionId;

                  if (!roomId || !roomSessionId) break;

                  await _media.closeParticipant({
                    roomId,
                    roomSessionId,
                    participantId: participantId as never,
                    participantSessionId: participantSessionId as never,
                    connectionId,
                  });
                  break;
                } catch (mediaError) {
                  const retryInMs = mediaRetryDelaysMs[mediaAttempt];
                  logger?.error('realtime_disconnect_media_cleanup_failed', {
                    connectionId,
                    participantId,
                    participantSessionId,
                    attempt: mediaAttempt + 1,
                    retryInMs: retryInMs ?? null,
                    error: mediaError instanceof Error ? mediaError.message : 'unknown',
                  });
                  if (retryInMs === undefined) break;
                  await new Promise<void>(resolve => setTimeout(resolve, retryInMs));
                }
              }
            }

            if (attempt > 0) {
              logger?.info('realtime_disconnect_persist_recovered', {
                connectionId,
                participantId,
                participantSessionId,
                attempts: attempt + 1,
              });
            }
            return;
          } catch (error) {
            const delayMs = retryDelaysMs[attempt];

            logger?.error('realtime_disconnect_persist_failed', {
              connectionId,
              participantId,
              participantSessionId,
              attempt: attempt + 1,
              retryInMs: delayMs ?? null,
              error: error instanceof Error ? error.message : 'unknown',
            });

            if (delayMs === undefined) break;
            await new Promise<void>(resolve => setTimeout(resolve, delayMs));
          }
        }

        logger?.error('realtime_disconnect_persist_exhausted', {
          connectionId,
          participantId,
          participantSessionId,
          message: 'Durable disconnect state could not be persisted during this process lifetime.',
        });
      };

      const finalizeConnection = async () => {
        if (finalized) return;
        finalized = true;

        const registered = registry.get(connectionId);
        if (!registered) return;

        const { roomId, roomSessionId, participantId, participantSessionId } = registered;

        if (roomId && roomSessionId && participantId && participantSessionId) {
          await persistDisconnect(participantId, participantSessionId);
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
            metrics?.recordProtocolViolation();

            if (protocolViolations >= maxProtocolViolations) {
              await transport.close(1008, 'Protocol violation limit exceeded.');
            }
          }

          if (response.error && router.isRateLimitViolation(response.error.code)) {
            metrics?.recordRateLimited();

            if (router.shouldCloseForRateLimit(session.connection)) {
              await transport.close(1008, 'Rate-limit violation limit exceeded.');
            }
          }
        } catch {
          await closeForProtocolViolation('INVALID_MESSAGE', 'Unable to process realtime message.');
        }
      });

      socket.on('close', () => void finalizeConnection());
      socket.on('error', () => {
        metrics?.recordConnectionError();
        void finalizeConnection();
      });
    },
  };
}
