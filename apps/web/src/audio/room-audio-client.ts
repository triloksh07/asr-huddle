import { Device, types } from 'mediasoup-client';
import type { MediaAudioState, ReactionType } from '@repo/media-contract';

type Result<T> =
  | { requestId: string; type: string; ok: true; payload: T }
  | {
      requestId: string;
      type: string;
      ok: false;
      error: { code: string; message: string };
    };

type RealtimeEvent = { type: string; payload: any };

type TransportResult = {
  transportId: string;
  direction: 'send' | 'recv';
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
  rtpCapabilities: any;
};

type ConsumeResult = {
  consumerId: string;
  producerId: string;
  kind: 'audio';
  rtpParameters: any;
};


export interface JoinedSession {
  roomId: string;
  roomSessionId: string;
  participantId: string;
  participantSessionId: string;
}

export class RoomAudioClient {
  private ws: WebSocket;
  private readonly pending = new Map<
    string,
    {
      resolve: (result: Result<any>) => void;
      reject: (error: Error) => void;
    }
  >();

  private readonly consumers = new Map<string, types.Consumer>();
  private sendTransport?: types.Transport;
  private recvTransport?: types.Transport;
  private producer?: types.Producer;
  private device?: Device;
  private session?: JoinedSession;
  private microphoneTrack?: MediaStreamTrack;

  private readonly messageHandler = (event: MessageEvent) => this.handleMessage(event.data);

  constructor(
    ws: WebSocket,
    private readonly onAudioTrack: (track: MediaStreamTrack) => void,
    private readonly onRealtimeEvent: (event: RealtimeEvent) => void = () => {}
  ) {
    this.ws = ws;
    this.attachSocket(ws);
  }

  async join(roomId: string): Promise<JoinedSession> {
    const result = await this.command<any>('room.join', { roomId });
    if (!result.ok) throw new Error(result.error.message);

    const participant = result.payload.participant ?? result.payload;
    if (!participant.id || !participant.roomSessionId) {
      throw new Error('room.join did not return participant session context');
    }

    this.session = {
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: result.payload.participantSessionId,
    };

    if (!this.session.participantSessionId) {
      throw new Error('room.join did not return participantSessionId');
    }

    return this.session;
  }

  async reconnect(ws: WebSocket): Promise<JoinedSession> {
    if (!this.session) throw new Error('There is no recoverable room session.');

    this.attachSocket(ws);
    await this.waitForSocketOpen(ws);

    const result = await this.command<any>('room.reconnect', {
      roomId: this.session.roomId,
      participantId: this.session.participantId,
      participantSessionId: this.session.participantSessionId,
    });

    if (!result.ok) throw new Error(result.error.message);

    this.session = {
      roomId: result.payload.roomId,
      roomSessionId: result.payload.roomSessionId,
      participantId: result.payload.participantId,
      participantSessionId: result.payload.participantSessionId,
    };

    await this.reconcileMedia();
    return this.session;
  }

  async setHandRaised(raised: boolean): Promise<void> {
    const result = await this.command<{ handRaised: boolean }>('speaker.hand', { raised });
    if (!result.ok) throw new Error(result.error.message);
  }

  async sendReaction(type: ReactionType): Promise<void> {
    const result = await this.command<void>('room.reaction', { type });
    if (!result.ok) throw new Error(result.error.message);
  }

  async enableMicrophone(): Promise<void> {
    if (!this.session) throw new Error('Join a room first.');
    if (this.producer) return;

    const state = await this.getAudioState();
    if (!state.canTransmitAudio) {
      throw new Error('The server does not currently authorize microphone transmission.');
    }

    await this.ensureDevice();
    await this.ensureSendTransport();

    if (!this.microphoneTrack) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone audio track was returned.');
      this.microphoneTrack = track;
    }

    this.producer = await this.sendTransport!.produce({
      track: this.microphoneTrack,
      appData: {
        participantId: this.session.participantId,
        participantSessionId: this.session.participantSessionId,
      },
    });

    await this.consumeCurrentSpeakers();
  }

  private async reconcileMedia(): Promise<void> {
    if (!this.session) return;

    const state = await this.getAudioState();

    await this.ensureDevice();

    if (state.canTransmitAudio) {
      if (!this.producer || this.isTransportUnusable(this.sendTransport)) {
        this.closeSendMediaOnly();
        await this.ensureSendTransport();

        if (!this.microphoneTrack) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          const track = stream.getAudioTracks()[0];
          if (!track) throw new Error('No microphone audio track was returned.');
          this.microphoneTrack = track;
        }

        this.producer = await this.sendTransport!.produce({
          track: this.microphoneTrack,
          appData: {
            participantId: this.session.participantId,
            participantSessionId: this.session.participantSessionId,
          },
        });
      }
    } else {
      if (this.producer) {
        // The logical mute state is authoritative. Keep the track and transport
        // available; a rebuilt producer is only created when canTransmitAudio is true.
        this.producer.close();
        this.producer = undefined;
      }
      if (this.microphoneTrack) this.microphoneTrack.enabled = false;
    }

    await this.ensureRecvTransport();
    await this.consumeCurrentSpeakers();
  }

  private async getAudioState(): Promise<MediaAudioState> {
    const result = await this.command<MediaAudioState>('media.audio.state', {});
    if (!result.ok) throw new Error(result.error.message);
    return result.payload;
  }

  private async ensureDevice(): Promise<void> {
    if (!this.device) this.device = new Device();

    if (this.device.loaded) return;

    const params = await this.createTransport('recv');
    await this.device.load({ routerRtpCapabilities: params.rtpCapabilities });
    this.recvTransport = this.configureRecvTransport(params);
  }

  private async ensureSendTransport(): Promise<void> {
    if (this.sendTransport && !this.isTransportUnusable(this.sendTransport)) return;

    const params = await this.createTransport('send');
    this.sendTransport = this.configureSendTransport(params);
  }

  private async ensureRecvTransport(): Promise<void> {
    if (this.recvTransport && !this.isTransportUnusable(this.recvTransport)) return;

    const params = await this.createTransport('recv');
    this.recvTransport = this.configureRecvTransport(params);
  }

  private isTransportUnusable(transport?: types.Transport): boolean {
    if (!transport) return true;
    const state = (transport as any).connectionState as string | undefined;
    return state === 'failed' || state === 'closed' || state === 'disconnected';
  }

  private closeSendMediaOnly(): void {
    this.producer?.close();
    this.sendTransport?.close();
    this.producer = undefined;
    this.sendTransport = undefined;
  }

  private attachSocket(ws: WebSocket): void {
    if (this.ws) {
      this.ws.removeEventListener('message', this.messageHandler);
    }
    this.ws = ws;
    ws.addEventListener('message', this.messageHandler);
  }

  private waitForSocketOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve();

    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      return Promise.reject(new Error('Reconnect WebSocket is already closed.'));
    }

    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Reconnect WebSocket closed before opening.'));
      };
      const cleanup = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('close', onClose);
      };
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('close', onClose, { once: true });
    });
  }

  private async createTransport(direction: 'send' | 'recv'): Promise<TransportResult> {
    const result = await this.command<TransportResult>('media.transport.create', { direction });
    if (!result.ok) throw new Error(result.error.message);
    return result.payload;
  }

  private wireConnect(transport: types.Transport): void {
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        const result = await this.command('media.transport.connect', {
          transportId: transport.id,
          dtlsParameters,
        });
        if (!result.ok) throw new Error(result.error.message);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });
  }

  private configureSendTransport(params: TransportResult): types.Transport {
    if (!this.device) throw new Error('Device is not initialized');

    const transport = this.device.createSendTransport(params as any);
    this.wireConnect(transport);

    transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const result = await this.command<any>('media.audio.produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData,
        });
        if (!result.ok) throw new Error(result.error.message);
        callback({ id: result.payload.producerId });
      } catch (error) {
        errback(error as Error);
      }
    });

    return transport;
  }

  private configureRecvTransport(params: TransportResult): types.Transport {
    if (!this.device) throw new Error('Device is not initialized');
    const transport = this.device.createRecvTransport(params as any);
    this.wireConnect(transport);
    return transport;
  }

  private async consumeCurrentSpeakers(): Promise<void> {
    if (!this.session || !this.recvTransport || !this.device) return;

    const result = await this.command<any>('media.audio.producers', {});
    if (!result.ok) throw new Error(result.error.message);

    for (const producer of result.payload as Array<{
      producerId: string;
      participantId: string;
    }>) {
      await this.consumeProducer(producer.producerId, producer.participantId);
    }
  }

  private async consumeProducer(producerId: string, participantId?: string): Promise<void> {
    if (!this.session || !this.recvTransport || !this.device) return;
    if (participantId === this.session.participantId || this.consumers.has(producerId)) {
      return;
    }

    const consumed = await this.command<ConsumeResult>('media.audio.consume', {
      roomId: this.session.roomId,
      participantId: this.session.participantId,
      participantSessionId: this.session.participantSessionId,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (!consumed.ok) throw new Error(consumed.error.message);

    const consumer = await this.recvTransport.consume({
      id: consumed.payload.consumerId,
      producerId: consumed.payload.producerId,
      kind: 'audio',
      rtpParameters: consumed.payload.rtpParameters,
    } as any);

    this.consumers.set(consumer.id, consumer);
    await consumer.resume();
    this.onAudioTrack(consumer.track);
  }

  private handleMessage(raw: string): void {
    let message: Result<any> | RealtimeEvent;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!('requestId' in message) || !message.requestId) {
      if ('type' in message && 'payload' in message) {
        this.onRealtimeEvent(message);

        if (message.type === 'media.audio.producer.created') {
          void this.consumeProducer(message.payload.producerId, message.payload.participantId);
        }
      }
      return;
    }

    const resolve = this.pending.get(message.requestId);
    if (!resolve) return;

    this.pending.delete(message.requestId);
    resolve.resolve(message as Result<any>);
  }

  private command<T>(type: string, payload: unknown): Promise<Result<T>> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });

      this.ws.send(
        JSON.stringify({
          requestId,
          type,
          payload,
        })
      );

      setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        pending.reject(new Error(`Timed out waiting for ${type}`));
      }, 15000);
    });
  }

  close(): void {
    this.microphoneTrack?.stop();
    this.producer?.close();

    for (const consumer of this.consumers.values()) consumer.close();

    this.sendTransport?.close();
    this.recvTransport?.close();

    this.microphoneTrack = undefined;
    this.producer = undefined;
    this.sendTransport = undefined;
    this.recvTransport = undefined;
    this.consumers.clear();

    this.ws.removeEventListener('message', this.messageHandler);

    for (const pending of this.pending.values()) {
      pending.reject(new Error('Audio client closed.'));
    }
    this.pending.clear();
  }
}
