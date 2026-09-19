import { Device, types } from 'mediasoup-client';

type Result<T> =
  | { requestId: string; type: string; ok: true; payload: T }
  | { requestId: string; type: string; ok: false; error: { code: string; message: string } };

type RealtimeEvent = {
  eventId?: string;
  sequence?: number;
  type: string;
  roomId?: string;
  payload?: any;
};

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

type ReconnectResult = {
  roomId: string;
  roomSessionId: string;
  participantId: string;
  participantSessionId: string;
  snapshot?: unknown;
  sequence?: number;
  mediaRecoveryRequired: boolean;
};

export type AudioSession = {
  roomId: string;
  roomSessionId: string;
  participantId: string;
  participantSessionId: string;
};

export class RuntimeAudioClient {
  private ws: WebSocket;
  private session?: AudioSession;
  private device?: Device;
  private sendTransport?: types.Transport;
  private recvTransport?: types.Transport;
  private producer?: types.Producer;
  private microphoneTrack?: MediaStreamTrack;
  private readonly consumers = new Map<string, types.Consumer>();
  private readonly pending = new Map<
    string,
    {
      resolve: (value: Result<any>) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(
    ws: WebSocket,
    private readonly log: (message: string) => void,
    private readonly onTrack: (track: MediaStreamTrack, producerId: string) => void,
    private readonly onEvent: (event: RealtimeEvent) => void
  ) {
    this.ws = ws;
    this.ws.addEventListener('message', this.onMessage);
  }

  get currentSession() {
    return this.session;
  }

  get hasProducer() {
    return !!this.producer;
  }

  get consumerCount() {
    return this.consumers.size;
  }

  async join(roomId: string): Promise<AudioSession> {
    const result = await this.command<any>('room.join', { roomId });
    if (!result.ok) throw new Error(result.error.message);

    const p = result.payload;
    this.session = {
      roomId: p.roomId,
      roomSessionId: p.roomSessionId,
      participantId: p.participantId,
      participantSessionId: p.participantSessionId,
    };

    this.log(`room.join OK participant=${this.session.participantId}`);
    await this.initializeReceivePath();
    return this.session;
  }

  /**
   * Recover an existing participant/session on a newly authenticated WebSocket.
   *
   * The recovered logical identity is reused, but every SFU resource is rebuilt
   * under the new realtime connection. The old producer/transport is never
   * reused. Microphone capture is retained when possible so browser permission
   * does not need to be requested again; the server still decides whether a
   * fresh producer may be created.
   */
  async reconnect(ws: WebSocket): Promise<AudioSession> {
    if (!this.session) throw new Error('No recoverable room session is available.');

    const previousSession = this.session;
    const shouldRestoreProducer = !!this.producer;

    this.ws.removeEventListener('message', this.onMessage);
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Realtime connection replaced for media recovery.'));
    }
    this.pending.clear();

    this.ws = ws;
    this.ws.addEventListener('message', this.onMessage);

    const result = await this.command<ReconnectResult>('room.reconnect', {
      roomId: previousSession.roomId,
      participantId: previousSession.participantId,
      participantSessionId: previousSession.participantSessionId,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const recovered = result.payload;

    if (!recovered.mediaRecoveryRequired) {
      throw new Error('Server did not request media recovery for the reconnected session.');
    }

    if (
      recovered.roomId !== previousSession.roomId ||
      recovered.roomSessionId !== previousSession.roomSessionId ||
      recovered.participantId !== previousSession.participantId ||
      recovered.participantSessionId !== previousSession.participantSessionId
    ) {
      throw new Error('Reconnect returned a different participant/session identity.');
    }

    this.session = {
      roomId: recovered.roomId,
      roomSessionId: recovered.roomSessionId,
      participantId: recovered.participantId,
      participantSessionId: recovered.participantSessionId,
    };

    this.log(
      `room.reconnect OK participant=${this.session.participantId} ` +
        `session=${this.session.participantSessionId} mediaRecoveryRequired=true`
    );

    // The old SFU resources were already invalidated by the server-side
    // disconnect path. Locally discard every old mediasoup object as well.
    // Keep the capture track so a valid speaker can establish a fresh producer
    // without another browser permission prompt.
    this.closeMedia({ preserveMicrophone: true });

    await this.initializeReceivePath();

    const audioState = await this.getAudioState();
    this.log(
      `reconnect media authorization role=${audioState.audioRole} ` +
        `selfMuted=${audioState.selfMuted} moderatorMuted=${audioState.moderatorMuted} ` +
        `canTransmitAudio=${audioState.canTransmitAudio}`
    );

    if (shouldRestoreProducer && audioState.canTransmitAudio) {
      await this.produceMicrophone();
      this.log('microphone producer recovered on the new media session');
    } else if (shouldRestoreProducer) {
      this.log(
        'previous producer existed, but current server state does not authorize transmission'
      );
    }

    return this.session;
  }

  async requestToSpeak(): Promise<void> {
    const result = await this.command<any>('speaker.request', {});
    if (!result.ok) throw new Error(result.error.message);
    this.log('speaker.request OK');
  }

  async approveRequest(requestId: string): Promise<void> {
    const result = await this.command<any>('speaker.request.approve', { requestId });
    if (!result.ok) throw new Error(result.error.message);
    this.log(`speaker.request.approve OK request=${requestId}`);
  }

  async enableMicrophone(): Promise<void> {
    if (!this.session) throw new Error('Join a room first.');
    if (this.producer) return;

    const state = await this.getAudioState();
    this.log(
      `media.audio.state canTransmitAudio=${state.canTransmitAudio} audioRole=${state.audioRole}`
    );

    if (!state.canTransmitAudio) {
      throw new Error('Server does not authorize microphone transmission yet.');
    }

    if (!this.device) await this.initializeDevice();
    await this.initializeSendTransport();

    await this.ensureMicrophoneTrack();
    await this.produceMicrophone();
    await this.consumeCurrentProducers();
  }

  async getAudioState(): Promise<{
    audioRole: string;
    selfMuted: boolean;
    moderatorMuted: boolean;
    canTransmitAudio: boolean;
  }> {
    const result = await this.command<any>('media.audio.state', {});
    if (!result.ok) throw new Error(result.error.message);
    return result.payload;
  }

  async leave(): Promise<void> {
    if (!this.session) return;
    const result = await this.command<any>('room.leave', { roomId: this.session.roomId });
    if (!result.ok) throw new Error(result.error.message);
    this.log('room.leave OK');
    this.closeMedia();
    this.session = undefined;
  }

  close(): void {
    this.closeMedia();
    this.ws.removeEventListener('message', this.onMessage);
    for (const pending of this.pending.values()) pending.reject(new Error('Audio client closed.'));
    this.pending.clear();
  }

  private async initializeReceivePath(): Promise<void> {
    if (!this.device) await this.initializeDevice();
    if (!this.recvTransport) await this.initializeReceiveTransport();
    await this.consumeCurrentProducers();
  }

  private async initializeDevice(): Promise<void> {
    this.log('Creating mediasoup Device...');
    this.device = new Device();

    const params = await this.createTransport('recv');
    await this.device.load({ routerRtpCapabilities: params.rtpCapabilities });
    this.recvTransport = this.configureRecvTransport(params);

    this.log('mediasoup Device loaded');
  }

  private async initializeSendTransport(): Promise<void> {
    if (this.sendTransport && this.sendTransport.connectionState !== 'closed') return;
    const params = await this.createTransport('send');
    this.sendTransport = this.configureSendTransport(params);
    this.log(`send transport created id=${params.transportId}`);
  }

  private async initializeReceiveTransport(): Promise<void> {
    if (this.recvTransport && this.recvTransport.connectionState !== 'closed') return;
    const params = await this.createTransport('recv');
    this.recvTransport = this.configureRecvTransport(params);
    this.log(`recv transport created id=${params.transportId}`);
  }

  private async createTransport(direction: 'send' | 'recv'): Promise<TransportResult> {
    const result = await this.command<TransportResult>('media.transport.create', { direction });
    if (!result.ok) throw new Error(result.error.message);
    return result.payload;
  }

  private configureSendTransport(params: TransportResult): types.Transport {
    if (!this.device) throw new Error('Device not initialized');

    const transport = this.device.createSendTransport(params as any);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        this.log(`media.transport.connect send=${transport.id}`);
        const result = await this.command<any>('media.transport.connect', {
          transportId: transport.id,
          dtlsParameters,
        });
        if (!result.ok) throw new Error(result.error.message);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

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
    if (!this.device) throw new Error('Device not initialized');

    const transport = this.device.createRecvTransport(params as any);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        this.log(`media.transport.connect recv=${transport.id}`);
        const result = await this.command<any>('media.transport.connect', {
          transportId: transport.id,
          dtlsParameters,
        });
        if (!result.ok) throw new Error(result.error.message);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    return transport;
  }

  private async consumeCurrentProducers(): Promise<void> {
    if (!this.session || !this.device || !this.recvTransport) return;

    const result = await this.command<any>('media.audio.producers', {});
    if (!result.ok) throw new Error(result.error.message);

    for (const producer of result.payload as Array<{
      producerId: string;
      participantId?: string;
    }>) {
      await this.consumeProducer(producer.producerId, producer.participantId);
    }
  }

  private async consumeProducer(producerId: string, participantId?: string): Promise<void> {
    if (!this.session || !this.device || !this.recvTransport) return;
    if (this.producer?.id === producerId || this.consumers.has(producerId)) return;
    if (participantId && participantId === this.session.participantId) return;

    const result = await this.command<ConsumeResult>('media.audio.consume', {
      roomId: this.session.roomId,
      participantId: this.session.participantId,
      participantSessionId: this.session.participantSessionId,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (!result.ok) throw new Error(result.error.message);

    const consumer = await this.recvTransport.consume({
      id: result.payload.consumerId,
      producerId: result.payload.producerId,
      kind: 'audio',
      rtpParameters: result.payload.rtpParameters,
    } as any);

    this.consumers.set(consumer.id, consumer);
    await consumer.resume();
    this.onTrack(consumer.track, result.payload.producerId);
    this.log(`consumer active id=${consumer.id} producer=${result.payload.producerId}`);
  }

  private async ensureMicrophoneTrack(): Promise<void> {
    if (this.microphoneTrack && this.microphoneTrack.readyState !== 'ended') return;

    this.log('Requesting browser microphone permission...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone audio track returned.');
    this.microphoneTrack = track;
  }

  private async produceMicrophone(): Promise<void> {
    if (!this.session) throw new Error('Join a room first.');
    if (this.producer) return;
    if (!this.sendTransport) throw new Error('Send transport is not initialized.');
    if (!this.microphoneTrack) throw new Error('Microphone track is not initialized.');

    this.log('Producing microphone audio...');
    const producer = await this.sendTransport.produce({
      track: this.microphoneTrack,
      appData: {
        participantId: this.session.participantId,
        participantSessionId: this.session.participantSessionId,
      },
    });

    this.producer = producer;
    this.log(`producer active id=${producer.id}`);
  }

  private readonly onMessage = (event: MessageEvent) => {
    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (pending) {
        this.pending.delete(message.requestId);
        pending.resolve(message);
      }
      return;
    }

    if (message.type && message.payload !== undefined) {
      const eventMessage: RealtimeEvent = message;
      this.onEvent(eventMessage);

      if (message.type === 'media.audio.producer.created' && message.payload?.producerId) {
        void this.consumeProducer(message.payload.producerId, message.payload.participantId).catch(
          error => this.log(`event consumer failed: ${(error as Error).message}`)
        );
      }
    }
  };

  private command<T>(type: string, payload: unknown): Promise<Result<T>> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`WebSocket is not open (${this.ws.readyState})`));
    }

    const requestId = crypto.randomUUID();
    this.log(`→ ${type} ${JSON.stringify(payload)}`);

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ requestId, type, payload }));

      window.setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 15000);
    });
  }

  private closeMedia(options: { preserveMicrophone?: boolean } = {}): void {
    this.producer?.close();
    for (const consumer of this.consumers.values()) consumer.close();
    this.sendTransport?.close();
    this.recvTransport?.close();

    if (!options.preserveMicrophone) {
      this.microphoneTrack?.stop();
      this.microphoneTrack = undefined;
    }

    this.producer = undefined;
    this.sendTransport = undefined;
    this.recvTransport = undefined;
    this.device = undefined;
    this.consumers.clear();
  }
}
