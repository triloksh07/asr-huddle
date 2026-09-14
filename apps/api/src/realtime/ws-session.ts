import type { ConnectionId, UserId } from '@repo/domain';
import { CommandRouter } from './command-router.js';
import { ConnectionRegistry } from './connection-registry.js';
import type { RealtimeConnection, RealtimeResponse, RealtimeTransport } from './types.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import { RuntimeMetricName } from '../observability/metric-vocabulary.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

interface RealtimeEnvelopeFields {
  readonly requestId?: string;
  readonly type?: string;
}

function readEnvelopeFields(raw: unknown): RealtimeEnvelopeFields {
  if (typeof raw !== 'object' || raw === null) return {};

  const value = raw as Record<string, unknown>;
  return {
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
    ...(typeof value.type === 'string' ? { type: value.type } : {}),
  };
}

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
  metrics?: RuntimeMetrics,
  logger?: StructuredLogger
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
      const { requestId, type } = readEnvelopeFields(raw);
      const startedAt = performance.now();
      const isReconnect = type === 'room.reconnect';

      if (isReconnect) metrics?.recordReconnectAttempt();

      try {
        const response = await router.dispatch({ connection, transport }, raw);
        const durationMs = performance.now() - startedAt;

        metrics?.recordCommand(response.ok);
        metrics?.observeHistogram(RuntimeMetricName.RealtimeCommandDurationMs, durationMs);

        if (isReconnect) {
          metrics?.observeHistogram(RuntimeMetricName.ParticipantReconnectDurationMs, durationMs);
          if (!response.ok) metrics?.recordReconnectFailure();
        }

        logger?.info('realtime_command_completed', {
          requestId,
          connectionId,
          userId,
          command: type,
          durationMs,
          result: response.ok ? 'success' : 'failure',
          ...(response.error?.code ? { errorCode: response.error.code } : {}),
        });

        await transport.send(response);
        return response;
      } catch (error) {
        const durationMs = performance.now() - startedAt;
        metrics?.observeHistogram(RuntimeMetricName.RealtimeCommandDurationMs, durationMs);

        if (isReconnect) {
          metrics?.observeHistogram(RuntimeMetricName.ParticipantReconnectDurationMs, durationMs);
          metrics?.recordReconnectFailure();
        }

        logger?.error('realtime_command_completed', {
          requestId,
          connectionId,
          userId,
          command: type,
          durationMs,
          result: 'exception',
          error: error instanceof Error ? error.message : 'unknown',
        });

        throw error;
      }
    },

    async close(code: number, reason: string): Promise<void> {
      registry.remove(connectionId);
      await transport.close(code, reason);
    },
  };
}
