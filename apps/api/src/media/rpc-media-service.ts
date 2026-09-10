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
  // CreateRoomMediaResult,
  ConsumeAudioResult,
} from '@repo/media-contract';
import { mediaRpcMethods } from '@repo/media-contract';
import { MediaControlError } from './media-errors.js';

export interface MediaRpcClientOptions {
  baseUrl: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class RpcMediaService implements MediaService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: MediaRpcClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 5000;
  }

  createRouter(context: CreateRoomMediaContext) {
    // return this.call<CreateRoomMediaResult>(mediaRpcMethods.createRouter, context);
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

  consumeAudio(command: ConsumeAudioCommand) {
    return this.call<ConsumeAudioResult>(mediaRpcMethods.consumeAudio, command);
  }

  listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]> {
    return this.call(mediaRpcMethods.listAudioProducers, context);
  }

  closeParticipantMedia(context: JoinMediaContext): Promise<void> {
    return this.call(mediaRpcMethods.closeParticipant, context);
  }

  closeRoomMedia(context: CreateRoomMediaContext): Promise<void> {
    return this.call(mediaRpcMethods.closeRoom, context);
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/rpc/media`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requestId: randomUUID(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      let body: any;
      try {
        body = await response.json();
      } catch {
        throw new MediaControlError('MEDIA_RPC_INVALID_RESPONSE', 'SFU returned invalid JSON.');
      }

      if (!response.ok || body?.ok !== true) {
        throw new MediaControlError(
          body?.error?.code ?? 'MEDIA_RPC_FAILED',
          body?.error?.message ?? 'SFU media operation failed.'
        );
      }

      return body.result as T;
    } catch (error) {
      if (error instanceof MediaControlError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MediaControlError('MEDIA_RPC_TIMEOUT', 'SFU media operation timed out.');
      }
      throw new MediaControlError('MEDIA_RPC_UNAVAILABLE', 'SFU media service is unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
