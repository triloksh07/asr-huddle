import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  JoinMediaContext,
  MediaService,
  MediaTransportDirection,
  ConnectTransportCommand,
} from '@repo/media-contract';
import {
  mediaRpcMethods,
  type MediaRpcMethod,
  type MediaRpcRequest,
  type MediaRpcResponse,
} from '@repo/media-contract';

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
    if (size > MAX_BODY_BYTES) {
      throw new Error('MEDIA_RPC_BODY_TOO_LARGE');
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export class MediaRpcServer {
  constructor(private readonly media: MediaService) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.setHeader('allow', 'POST');
      response.end();
      return;
    }

    try {
      const raw = await readJson(request);
      const rpc = this.parseRequest(raw);

      const result = await this.dispatch(rpc.method, rpc.params);
      sendJson(response, 200, {
        requestId: rpc.requestId,
        ok: true,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Media RPC failed.';
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'MEDIA_RPC_FAILED';

      sendJson(response, 400, {
        requestId: this.requestIdFromError(request),
        ok: false,
        error: { code, message },
      });
    }
  }

  private parseRequest(raw: unknown): MediaRpcRequest {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_MEDIA_RPC');

    const value = raw as Partial<MediaRpcRequest>;
    if (
      typeof value.requestId !== 'string' ||
      typeof value.method !== 'string' ||
      !Object.values(mediaRpcMethods).includes(value.method as MediaRpcMethod)
    ) {
      throw new Error('INVALID_MEDIA_RPC');
    }

    return value as MediaRpcRequest;
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

      case mediaRpcMethods.closeParticipant:
        return this.media.closeParticipantMedia(params as never);

      case mediaRpcMethods.closeRoom:
        return this.media.closeRoomMedia(params as never);

      default:
        return Promise.reject(new Error(`Unsupported media RPC method: ${method}`));
    }
  }

  private requestIdFromError(_: IncomingMessage): string {
    return randomUUID();
  }
}
