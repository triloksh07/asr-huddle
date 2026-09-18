import { randomUUID } from 'node:crypto';
import type {
  ConnectTransportCommand,
  ConsumeAudioCommand,
  CreateRoomMediaContext,
  CreateTransportResult,
  JoinMediaContext,
  MediaProducerInfo,
  MediaService,
  ProduceAudioCommand,
  ProduceAudioResult,
  ConsumeAudioResult,
  MediaCapabilities,
} from '@repo/media-contract';
import { mediaRpcMethods } from '@repo/media-contract';
import { MediaControlError } from './media-errors.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

export interface MediaRpcClientOptions {
  baseUrl: string;
  authSecret: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  metrics?: RuntimeMetrics;
  logger?: StructuredLogger;
}

interface MediaRpcSuccessBody {
  readonly requestId: string;
  readonly ok: true;
  readonly result: unknown;
}
interface MediaRpcFailureBody {
  readonly requestId: string;
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string };
}
type MediaRpcResponseBody = MediaRpcSuccessBody | MediaRpcFailureBody;

function isMediaRpcResponseBody(value: unknown): value is MediaRpcResponseBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (typeof body.requestId !== 'string' || typeof body.ok !== 'boolean') return false;
  if (body.ok) return 'result' in body;
  if (!body.error || typeof body.error !== 'object') return false;
  const error = body.error as Record<string, unknown>;
  return typeof error.code === 'string' && typeof error.message === 'string';
}

export class RpcMediaService implements MediaService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: MediaRpcClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 5000;
  }

  createRouter(
    context: CreateRoomMediaContext
  ): Promise<{ routerId: string; rtpCapabilities: MediaCapabilities }> {
    return this.call(mediaRpcMethods.createRouter, context);
  }
  createWebRtcTransport(context: JoinMediaContext): Promise<CreateTransportResult> {
    return this.call(mediaRpcMethods.createTransport, context);
  }
  connectWebRtcTransport(command: ConnectTransportCommand): Promise<void> {
    return this.call(mediaRpcMethods.connectTransport, command);
  }
  produceAudio(command: ProduceAudioCommand): Promise<ProduceAudioResult> {
    return this.call(mediaRpcMethods.produceAudio, command);
  }
  consumeAudio(command: ConsumeAudioCommand): Promise<ConsumeAudioResult> {
    return this.call(mediaRpcMethods.consumeAudio, command);
  }
  listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]> {
    return this.call(mediaRpcMethods.listAudioProducers, context);
  }
  revokeAudioProduction(context: JoinMediaContext): Promise<void> {
    return this.call(mediaRpcMethods.revokeAudioProduction, context);
  }
  closeParticipantMedia(
    context: Parameters<MediaService['closeParticipantMedia']>[0]
  ): Promise<void> {
    return this.call(mediaRpcMethods.closeParticipant, context);
  }
  closeRoomMedia(context: CreateRoomMediaContext): Promise<void> {
    return this.call(mediaRpcMethods.closeRoom, context);
  }

  private async call<T>(method: string, params: object): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = performance.now();
    const requestId = randomUUID();
    const context = extractLogContext(params);

    this.options.logger?.info('media_rpc_started', {
      requestId,
      operation: method,
      ...context,
    });

    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/rpc/media`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.authSecret}`,
        },
        body: JSON.stringify({ requestId, method, params }),
        signal: controller.signal,
      });
      let rawBody: unknown;
      try {
        rawBody = await response.json();
      } catch {
        throw new MediaControlError('MEDIA_RPC_INVALID_RESPONSE', 'SFU returned invalid JSON.');
      }
      if (!isMediaRpcResponseBody(rawBody)) {
        throw new MediaControlError(
          'MEDIA_RPC_INVALID_RESPONSE',
          'SFU returned an invalid response.'
        );
      }
      if (rawBody.requestId !== requestId) {
        throw new MediaControlError(
          'MEDIA_RPC_INVALID_RESPONSE',
          'SFU response requestId did not match the request.'
        );
      }
      if (!response.ok || rawBody.ok !== true) {
        const failure = rawBody as MediaRpcFailureBody;
        throw new MediaControlError(failure.error.code, failure.error.message);
      }
      const durationMs = performance.now() - startedAt;
      this.options.metrics?.recordDependency('media_rpc', methodToMetric(method), true, durationMs);
      this.options.logger?.info('media_rpc_completed', {
        requestId,
        operation: method,
        statusCode: response.status,
        durationMs: Math.round(durationMs * 100) / 100,
        result: 'success',
        ...context,
      });
      return rawBody.result as T;
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.options.metrics?.recordDependency(
        'media_rpc',
        methodToMetric(method),
        false,
        durationMs
      );
      const normalizedError =
        error instanceof DOMException && error.name === 'AbortError'
          ? new MediaControlError('MEDIA_RPC_TIMEOUT', 'SFU media operation timed out.')
          : error instanceof MediaControlError
            ? error
            : new MediaControlError('MEDIA_RPC_UNAVAILABLE', 'SFU media service is unavailable.');
      this.options.logger?.error('dependency_operation_failed', {
        requestId,
        dependency: 'media_rpc',
        operation: methodToMetric(method),
        durationMs: Math.round(durationMs * 100) / 100,
        error: normalizedError.message,
        errorCode: normalizedError.code,
        ...context,
      });
      throw normalizedError;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractLogContext(params: object): Record<string, unknown> {
  const value = params as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const key of [
    'roomId',
    'roomSessionId',
    'participantId',
    'participantSessionId',
    'connectionId',
  ]) {
    if (typeof value[key] === 'string') fields[key] = value[key];
  }
  return fields;
}

function methodToMetric(method: string): string {
  return method.replace(/[^a-zA-Z0-9_]/g, '_');
}
