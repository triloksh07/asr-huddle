import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  JoinMediaContext,
  CloseParticipantMediaContext,
  MediaService,
  MediaTransportDirection,
  ConnectTransportCommand,
} from '@repo/media-contract';
import {
  mediaRpcMethods,
  type MediaRpcMethod,
  type MediaRpcRequest,
  type MediaRpcResponse,
  mediaRpcParamsSchemas,
} from '@repo/media-contract';
import { SfuMetricName, SfuOperationalMetrics } from '../observability/sfu-operational-metrics.js';
import { SfuStructuredLogger } from '../observability/structured-logger.js';

const MAX_BODY_BYTES = 256 * 1024;

function sendJson(response: ServerResponse, status: number, body: MediaRpcResponse): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('MEDIA_RPC_BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearerToken(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  if (!value || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function secretsEqual(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

export class MediaRpcServer {
  constructor(
    private readonly media: MediaService,
    private readonly authSecret: string,
    private readonly metrics = new SfuOperationalMetrics(),
    private readonly logger = new SfuStructuredLogger()
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.setHeader('allow', 'POST');
      response.end();
      return;
    }

    if (!secretsEqual(bearerToken(request) ?? '', this.authSecret)) {
      sendJson(response, 401, {
        requestId: randomUUID(),
        ok: false,
        error: { code: 'MEDIA_RPC_UNAUTHORIZED', message: 'Media RPC authorization failed.' },
      });
      return;
    }

    let requestId: string = randomUUID();
    let method = 'unknown';
    const startedAt = performance.now();

    try {
      const raw = await readJson(request);
      const rpc = this.parseRequest(raw);
      requestId = rpc.requestId;
      method = rpc.method;

      this.logger.info('sfu_media_rpc_received', { requestId, method });
      const result = await this.dispatch(rpc.method, rpc.params);
      const normalizedResult = result === undefined ? null : result;
      const durationMs = performance.now() - startedAt;
      this.metrics.observeDuration(durationMs);

      sendJson(response, 200, { requestId, ok: true, result: normalizedResult });
      this.logger.info('sfu_media_rpc_completed', {
        requestId,
        method,
        statusCode: 200,
        durationMs: Math.round(durationMs * 100) / 100,
        result: 'success',
      });
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.metrics.observeDuration(durationMs);
      this.metrics.increment(SfuMetricName.MediaOperationFailuresTotal);
      const message = error instanceof Error ? error.message : 'Media RPC failed.';
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'MEDIA_RPC_FAILED';
      const status =
        code === 'MEDIA_RPC_BODY_TOO_LARGE' ? 413 : code === 'INVALID_MEDIA_RPC' ? 400 : 500;

      sendJson(response, status, { requestId, ok: false, error: { code, message } });
      this.logger.error('sfu_media_rpc_failed', {
        requestId,
        method,
        statusCode: status,
        durationMs: Math.round(durationMs * 100) / 100,
        error: message,
        errorCode: code,
      });
    }
  }

  private parseRequest(raw: unknown): MediaRpcRequest {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_MEDIA_RPC');
    const value = raw as Partial<MediaRpcRequest>;
    if (
      typeof value.requestId !== 'string' ||
      value.requestId.length === 0 ||
      typeof value.method !== 'string' ||
      !Object.values(mediaRpcMethods).includes(value.method as MediaRpcMethod) ||
      !value.params ||
      typeof value.params !== 'object'
    )
      throw new Error('INVALID_MEDIA_RPC');

    const schema = mediaRpcParamsSchemas[value.method as MediaRpcMethod];
    const parsed = schema.safeParse(value.params);
    if (!parsed.success) throw new Error('INVALID_MEDIA_RPC');
    return {
      requestId: value.requestId,
      method: value.method as MediaRpcMethod,
      params: parsed.data as MediaRpcRequest['params'],
    };
  }

  private dispatch(method: MediaRpcMethod, params: MediaRpcRequest['params']): Promise<unknown> {
    switch (method) {
      case mediaRpcMethods.createRouter:
        return this.media.createRouter(params as never);
      case mediaRpcMethods.createTransport: {
        const { direction = 'send', ...context } = params as {
          direction?: MediaTransportDirection;
        } & JoinMediaContext;
        return this.media.createWebRtcTransport(context as JoinMediaContext, direction);
      }
      case mediaRpcMethods.connectTransport:
        return this.media.connectWebRtcTransport(params as ConnectTransportCommand);
      case mediaRpcMethods.produceAudio:
        return this.media.produceAudio(params as never);
      case mediaRpcMethods.consumeAudio:
        return this.media.consumeAudio(params as never);
      case mediaRpcMethods.listAudioProducers:
        return this.media.listAudioProducers(params as never);
      case mediaRpcMethods.revokeAudioProduction:
        return this.media.revokeAudioProduction(params as never);
      case mediaRpcMethods.closeParticipant:
        return this.media.closeParticipantMedia(params as CloseParticipantMediaContext);
      case mediaRpcMethods.closeRoom:
        return this.media.closeRoomMedia(params as never);
      default:
        return Promise.reject(new Error(`Unsupported media RPC method: ${method}`));
    }
  }
}
