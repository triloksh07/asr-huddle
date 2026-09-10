import { Device, types } from 'mediasoup-client';

type Result<T> =
  | { requestId: string; type: string; ok: true; payload: T }
  | { requestId: string; type: string; ok: false; error: { code: string; message: string } };
type TransportResult = {
  transportId: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
  direction: 'send' | 'recv';
  rtpCapabilities: any;
};
type ConsumeResult = { consumerId: string; producerId: string; kind: 'audio'; rtpParameters: any };

export interface JoinedSession {
  roomId: string;
  roomSessionId: string;
  participantId: string;
  participantSessionId: string;
}

export class RoomAudioClient {
  private readonly pending = new Map<string, (result: Result<any>) => void>();
  private sendTransport?: types.Transport;
  private recvTransport?: types.Transport;
  private producer?: types.Producer;
  private readonly consumers = new Map<string, types.Consumer>();
  private device?: Device;
  private session?: JoinedSession;

  constructor(
    private readonly ws: WebSocket,
    private readonly onAudioTrack: (track: MediaStreamTrack) => void
  ) {
    ws.addEventListener('message', event => this.handleMessage(event.data));
  }

  async join(roomId: string): Promise<JoinedSession> {
    const result = await this.command<any>('room.join', { roomId });
    if (!result.ok) throw new Error(result.error.message);
    const participant = result.payload.participant ?? result.payload;
    if (!participant.id || !participant.roomSessionId)
      throw new Error('room.join did not return participant session context');
    this.session = {
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: result.payload.participantSessionId,
    };
    if (!this.session.participantSessionId)
      throw new Error('room.join did not return participantSessionId');
    return this.session;
  }

  async enableMicrophone(): Promise<void> {
    if (!this.session) throw new Error('Join a room first.');
    const sendParams = await this.createTransport('send');
    if (!this.device) this.device = new Device();
    if (!this.device.loaded)
      await this.device.load({ routerRtpCapabilities: sendParams.rtpCapabilities });
    this.sendTransport = this.configureSendTransport(sendParams);

    const recvParams = await this.createTransport('recv');
    this.recvTransport = this.configureRecvTransport(recvParams);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone audio track was returned.');
    this.producer = await this.sendTransport.produce({
      track,
      appData: {
        participantId: this.session.participantId,
        participantSessionId: this.session.participantSessionId,
      },
    });
    await this.consumeCurrentSpeakers();
  }

  private async createTransport(direction: 'send' | 'recv'): Promise<TransportResult> {
    const result = await this.command<TransportResult>('media.transport.create', { direction });
    if (!result.ok) throw new Error(result.error.message);
    return result.payload;
  }

  private wireConnect(transport: types.Transport): void {
    transport.on(
      'connect',
      async (
        { dtlsParameters }: { dtlsParameters: types.DtlsParameters },
        callback: () => void,
        errback: (error: Error) => void
      ) => {
        try {
          const r = await this.command('media.transport.connect', {
            transportId: transport.id,
            dtlsParameters,
          });
          if (!r.ok) throw new Error(r.error.message);
          callback();
        } catch (error) {
          errback(error as Error);
        }
      }
    );
  }

  private configureSendTransport(params: TransportResult): types.Transport {
    if (!this.device) throw new Error('Device is not initialized');
    const transport = this.device.createSendTransport(params as any);
    this.wireConnect(transport);
    transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const r = await this.command<any>('media.audio.produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData,
        });
        if (!r.ok) throw new Error(r.error.message);
        callback({ id: r.payload.producerId });
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
    if (!this.device.loaded) throw new Error('mediasoup Device is not loaded');
    const result = await this.command<any>('media.audio.producers', {});
    if (!result.ok) throw new Error(result.error.message);
    for (const producer of result.payload as Array<{ producerId: string; participantId: string }>) {
      if (producer.participantId === this.session.participantId) continue;
      if (this.consumers.has(producer.producerId)) continue;
      const consumed = await this.command<ConsumeResult>('media.audio.consume', {
        transportId: this.recvTransport.id,
        producerId: producer.producerId,
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
      this.onAudioTrack(consumer.track);
    }
  }

  private command<T>(type: string, payload: unknown): Promise<Result<T>> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, resolve);
      this.ws.send(
        JSON.stringify({
          version: 1,
          messageId: crypto.randomUUID(),
          requestId,
          type,
          timestamp: new Date().toISOString(),
          payload,
        })
      );
      setTimeout(() => {
        if (this.pending.delete(requestId)) reject(new Error(`Timed out waiting for ${type}`));
      }, 15000);
    });
  }

  private handleMessage(raw: string): void {
    let message: Result<any>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message.requestId) return;
    const resolve = this.pending.get(message.requestId);
    if (!resolve) return;
    this.pending.delete(message.requestId);
    resolve(message);
  }
}
