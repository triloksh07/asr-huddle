import type { RedisSequencedRealtimeEventPublisher } from '@repo/redis-models';
import type {
  ActiveSpeakersState,
  DominantSpeakerState,
  MediaProducerInfo,
  MediaService,
  MediaTransportDirection,
  MediaTransportId,
  MediaCapabilities,
  CreateRoomMediaContext,
  JoinMediaContext,
  CreateTransportResult,
  ConnectTransportCommand,
  ProduceAudioCommand,
  ProduceAudioResult,
  ConsumeAudioCommand,
  ConsumeAudioResult,
} from '@repo/media-contract';
import type { ParticipantId, ParticipantSessionId } from '@repo/domain';
import * as mediasoup from 'mediasoup';
import type { Consumer, Producer, Router, WebRtcTransport, Worker } from 'mediasoup/types';
import { MediaPlaneError } from './errors.js';
import { SfuMetricName, SfuOperationalMetrics } from '../observability/sfu-operational-metrics.js';
import { SfuStructuredLogger } from '../observability/structured-logger.js';

interface ParticipantMedia {
  transports: Map<
    string,
    {
      transport: WebRtcTransport;
      direction: MediaTransportDirection;
    }
  >;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

interface RoomMedia {
  router: Router;
  roomSessionId: string;
  participants: Map<string, ParticipantMedia>;
  audioLevelObserver: Awaited<ReturnType<Router['createAudioLevelObserver']>>;
  activeSpeakerObserver: Awaited<ReturnType<Router['createActiveSpeakerObserver']>>;
  activeSpeakerSignature: string;
  speakingUpdateTail: Promise<void>;
}

export interface MediasoupServiceOptions {
  worker: Worker;
  mediaCodecs: mediasoup.types.RtpCodecCapability[];
  announcedAddress?: string;
  realtimeEvents?: RedisSequencedRealtimeEventPublisher;
  activeSpeakerThreshold?: number;
  activeSpeakerIntervalMs?: number;
  activeSpeakerMaxEntries?: number;
  metrics?: SfuOperationalMetrics;
  logger?: SfuStructuredLogger;
}

export class MediasoupMediaService implements MediaService {
  private readonly rooms = new Map<string, RoomMedia>();
  private readonly metrics: SfuOperationalMetrics;
  private readonly logger: SfuStructuredLogger;

  constructor(private readonly options: MediasoupServiceOptions) {
    this.metrics = options.metrics ?? new SfuOperationalMetrics();
    this.logger = options.logger ?? new SfuStructuredLogger();
  }

  async createRouter(context: CreateRoomMediaContext) {
    const existing = this.rooms.get(context.roomId);

    if (existing) {
      return {
        routerId: existing.router.id,
        rtpCapabilities: existing.router.rtpCapabilities as unknown as MediaCapabilities,
      };
    }

    let router: Router;

    try {
      router = await this.options.worker.createRouter({
        mediaCodecs: this.options.mediaCodecs,
      });
    } catch (error) {
      this.metrics.increment(SfuMetricName.RouterFailuresTotal);

      this.logger.error('sfu_router_create_failed', {
        workerPid: this.options.worker.pid,
        error: error instanceof Error ? error.message : 'unknown',
      });

      throw error;
    }

    this.metrics.increment(SfuMetricName.RouterCreationsTotal);

    router.observer.on('close', () => {
      this.logger.info('sfu_router_closed', {
        routerId: router.id,
        roomId: context.roomId,
      });
    });

    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: this.options.activeSpeakerMaxEntries ?? 10,
      threshold: this.options.activeSpeakerThreshold ?? -70,
      interval: this.options.activeSpeakerIntervalMs ?? 500,
    });

    const activeSpeakerObserver = await router.createActiveSpeakerObserver({
      interval: this.options.activeSpeakerIntervalMs ?? 500,
    });

    const room: RoomMedia = {
      router,
      roomSessionId: context.roomSessionId,
      participants: new Map(),
      audioLevelObserver,
      activeSpeakerObserver,
      activeSpeakerSignature: '',
      speakingUpdateTail: Promise.resolve(),
    };

    this.rooms.set(context.roomId, room);

    router.observer.on('close', () => {
      this.rooms.delete(context.roomId);
    });

    audioLevelObserver.on('volumes', volumes => {
      this.enqueueActiveSpeakerUpdate(
        context.roomId,
        room,
        volumes.map(item => item.producer.id)
      );
    });

    audioLevelObserver.on('silence', () => {
      this.enqueueActiveSpeakerUpdate(context.roomId, room, []);
    });

    activeSpeakerObserver.on('dominantspeaker', info => {
      void this.publishDominantSpeaker(context.roomId, room, info.producer?.id ?? null);
    });

    audioLevelObserver.observer.on('close', () => undefined);
    activeSpeakerObserver.observer.on('close', () => undefined);

    return {
      routerId: router.id,
      rtpCapabilities: router.rtpCapabilities as unknown as MediaCapabilities,
    };
  }

  async createWebRtcTransport(
    context: JoinMediaContext,
    direction: MediaTransportDirection
  ): Promise<CreateTransportResult> {
    const room = this.requireRoom(context.roomId);
    const participant = this.getOrCreateParticipant(room, context.participantId);

    const transport = await room.router.createWebRtcTransport({
      listenInfos: [
        {
          protocol: 'udp',
          ip: '0.0.0.0',
          ...(this.options.announcedAddress
            ? { announcedAddress: this.options.announcedAddress }
            : {}),
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: {
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        direction,
        connectionId: context.connectionId,
      },
    });

    participant.transports.set(transport.id, {
      transport,
      direction,
    });

    transport.observer.on('close', () => {
      participant.transports.delete(transport.id);
    });

    transport.on('dtlsstatechange', state => {
      if (state === 'failed') {
        this.metrics.increment(SfuMetricName.TransportFailuresTotal);

        this.logger.error('sfu_transport_dtls_failed', {
          roomId: context.roomId,
          transportId: transport.id,
          direction,
        });
      }

      if (state === 'failed' || state === 'closed') {
        transport.close();
      }
    });

    transport.on('icestatechange', state => {
      if (state === 'closed') {
        transport.close();
      }
    });

    return {
      transportId: transport.id as MediaTransportId,
      direction,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      rtpCapabilities: room.router.rtpCapabilities as unknown as MediaCapabilities,
    };
  }

  async connectWebRtcTransport(command: ConnectTransportCommand): Promise<void> {
    const transport = this.findTransport(command.transportId);

    if (transport.closed) {
      throw new MediaPlaneError(
        'TRANSPORT_CLOSED',
        `Transport ${command.transportId} is already closed.`
      );
    }

    if (
      transport.appData.participantId !== command.participantId ||
      transport.appData.participantSessionId !== command.participantSessionId ||
      transport.appData.connectionId !== command.connectionId
    ) {
      throw new MediaPlaneError(
        'MEDIA_IDENTITY_MISMATCH',
        'Transport ownership does not match the current media session.'
      );
    }

    await transport.connect({
      dtlsParameters: command.dtlsParameters as never,
    });
  }

  async produceAudio(command: ProduceAudioCommand): Promise<ProduceAudioResult> {
    const transport = this.findTransport(command.transportId);
    const owner = this.findParticipantByTransport(transport.id);

    if (!owner) {
      throw new MediaPlaneError('MEDIA_OWNER_NOT_FOUND', 'Producer owner could not be resolved.');
    }

    const entry = owner.transports.get(transport.id);

    if (!entry || entry.direction !== 'send') {
      throw new MediaPlaneError(
        'INVALID_PRODUCER_TRANSPORT',
        'Audio production requires a send transport.'
      );
    }

    if (owner.producers.size) {
      throw new MediaPlaneError(
        'AUDIO_PRODUCER_ALREADY_EXISTS',
        'Participant already has an audio producer.'
      );
    }

    if (
      command.appData.participantId !== transport.appData.participantId ||
      command.appData.participantSessionId !== transport.appData.participantSessionId ||
      command.appData.connectionId !== transport.appData.connectionId
    ) {
      throw new MediaPlaneError(
        'MEDIA_IDENTITY_MISMATCH',
        'Producer identity does not match transport ownership.'
      );
    }

    let producer: Producer;

    try {
      producer = await transport.produce({
        kind: 'audio',
        rtpParameters: command.rtpParameters as never,
        appData: command.appData,
      });
    } catch (error) {
      this.metrics.increment(SfuMetricName.ProducerFailuresTotal);

      this.logger.error('sfu_producer_create_failed', {
        transportId: transport.id,
        error: error instanceof Error ? error.message : 'unknown',
      });

      throw error;
    }

    owner.producers.set(producer.id, producer);

    const room = this.findRoomByTransport(transport.id);

    if (room) {
      await room.audioLevelObserver.addProducer({
        producerId: producer.id,
      });

      await room.activeSpeakerObserver.addProducer({
        producerId: producer.id,
      });
    }

    producer.observer.on('close', () => {
      owner.producers.delete(producer.id);

      if (room) {
        try {
          room.audioLevelObserver.removeProducer({
            producerId: producer.id,
          });
        } catch {}

        try {
          room.activeSpeakerObserver.removeProducer({
            producerId: producer.id,
          });
        } catch {}
      }
    });

    return {
      producerId: producer.id as never,
    };
  }

  async consumeAudio(command: ConsumeAudioCommand): Promise<ConsumeAudioResult> {
    const room = this.requireRoom(command.roomId);
    const participant = this.getOrCreateParticipant(room, command.participantId);

    if (
      !room.router.canConsume({
        producerId: command.producerId,
        rtpCapabilities: command.rtpCapabilities as never,
      })
    ) {
      throw new MediaPlaneError(
        'CANNOT_CONSUME',
        'The participant RTP capabilities cannot consume this producer.'
      );
    }

    const entry = [...participant.transports.values()].find(
      item => !item.transport.closed && item.direction === 'recv'
    );

    if (!entry) {
      throw new MediaPlaneError(
        'CONSUMER_TRANSPORT_NOT_FOUND',
        'No active receive WebRTC transport exists.'
      );
    }

    if (
      entry.transport.appData.participantId !== command.participantId ||
      entry.transport.appData.participantSessionId !== command.participantSessionId ||
      entry.transport.appData.participantSessionId !== command.participantSessionId ||
      entry.transport.appData.connectionId !== command.connectionId
    ) {
      throw new MediaPlaneError(
        'MEDIA_IDENTITY_MISMATCH',
        'Consumer identity does not match transport ownership.'
      );
    }

    let consumer: Consumer;

    try {
      consumer = await entry.transport.consume({
        producerId: command.producerId,
        rtpCapabilities: command.rtpCapabilities as never,
        paused: true,
        appData: {
          participantId: command.participantId,
          participantSessionId: command.participantSessionId,
          connectionId: command.connectionId,
        },
      });
    } catch (error) {
      this.metrics.increment(SfuMetricName.ConsumerFailuresTotal);

      this.logger.error('sfu_consumer_create_failed', {
        transportId: entry.transport.id,
        producerId: command.producerId,
        error: error instanceof Error ? error.message : 'unknown',
      });

      throw error;
    }

    participant.consumers.set(consumer.id, consumer);

    consumer.observer.on('close', () => {
      participant.consumers.delete(consumer.id);
    });

    return {
      consumerId: consumer.id as never,
      producerId: command.producerId,
      kind: 'audio',
      rtpParameters: consumer.rtpParameters,
    };
  }

  async revokeAudioProduction(context: JoinMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);

    if (!room) return;

    const participant = room.participants.get(context.participantId);

    if (!participant) return;

    for (const producer of participant.producers.values()) {
      if (
        producer.appData.participantId === context.participantId &&
        producer.appData.participantSessionId === context.participantSessionId &&
        producer.appData.connectionId === context.connectionId
      ) {
        producer.close();
      }
    }
  }

  async listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]> {
    const room = this.requireRoom(context.roomId);
    const result: MediaProducerInfo[] = [];

    for (const participant of room.participants.values()) {
      for (const producer of participant.producers.values()) {
        if (!producer.closed && producer.kind === 'audio') {
          result.push({
            producerId: producer.id as never,
            participantId: producer.appData.participantId as ParticipantId,
            participantSessionId: producer.appData.participantSessionId as ParticipantSessionId,
            kind: 'audio',
          });
        }
      }
    }

    return result;
  }

  async closeParticipantMedia(context: JoinMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);

    if (!room) return;

    const participant = room.participants.get(context.participantId);

    if (!participant) return;

    for (const consumer of participant.consumers.values()) {
      consumer.close();
    }

    for (const producer of participant.producers.values()) {
      producer.close();
    }

    for (const entry of participant.transports.values()) {
      entry.transport.close();
    }

    room.participants.delete(context.participantId);
  }

  async closeRoomMedia(context: CreateRoomMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);

    if (!room) return;

    room.router.close();
    this.rooms.delete(context.roomId);
  }

  diagnostics() {
    let activeTransports = 0;
    let activeProducers = 0;
    let activeConsumers = 0;

    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        activeTransports += participant.transports.size;
        activeProducers += participant.producers.size;
        activeConsumers += participant.consumers.size;
      }
    }

    return {
      activeRooms: this.rooms.size,
      activeTransports,
      activeProducers,
      activeConsumers,
    };
  }

  private enqueueActiveSpeakerUpdate(roomId: string, room: RoomMedia, producerIds: string[]): void {
    room.speakingUpdateTail = room.speakingUpdateTail
      .then(() => this.publishActiveSpeakers(roomId, room, producerIds))
      .catch(error => {
        this.metrics.increment(SfuMetricName.RealtimePublicationFailuresTotal);

        this.logger.error('sfu_active_speaker_publish_failed', {
          roomId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
  }

  private async publishActiveSpeakers(
    roomId: string,
    room: RoomMedia,
    producerIds: string[]
  ): Promise<void> {
    const speakers = producerIds
      .map(id => this.findProducerOwner(room, id))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map(x => ({
        participantId: x.participantId as ParticipantId,
        participantSessionId: x.participantSessionId as ParticipantSessionId,
        producerId: x.producerId as never,
      }));

    speakers.sort((a, b) => String(a.producerId).localeCompare(String(b.producerId)));

    const payload: ActiveSpeakersState = {
      speakers,
    };

    const signature = speakers.map(x => `${x.participantId}:${x.producerId}`).join('|');

    if (signature === room.activeSpeakerSignature) {
      return;
    }

    room.activeSpeakerSignature = signature;

    if (!this.options.realtimeEvents) {
      return;
    }

    try {
      await this.options.realtimeEvents.publish({
        roomId,
        roomSessionId: room.roomSessionId,
        type: 'media.audio.active-speakers.updated',
        occurredAt: new Date().toISOString(),
        payload,
      });
    } catch (error) {
      this.metrics.increment(SfuMetricName.RealtimePublicationFailuresTotal);

      throw error;
    }
  }

  private async publishDominantSpeaker(
    roomId: string,
    room: RoomMedia,
    producerId: string | null
  ): Promise<void> {
    let state: DominantSpeakerState = {
      participantId: null,
      participantSessionId: null,
      producerId: null,
    };

    if (producerId) {
      const owner = this.findProducerOwner(room, producerId);

      if (owner) {
        state = {
          participantId: owner.participantId as ParticipantId,
          participantSessionId: owner.participantSessionId as ParticipantSessionId,
          producerId: owner.producerId as never,
        };
      }
    }

    if (!this.options.realtimeEvents) {
      return;
    }

    try {
      await this.options.realtimeEvents.publish({
        roomId,
        roomSessionId: room.roomSessionId,
        type: 'media.audio.dominant-speaker.changed',
        occurredAt: new Date().toISOString(),
        payload: state,
      });
    } catch (error) {
      this.metrics.increment(SfuMetricName.RealtimePublicationFailuresTotal);

      throw error;
    }
  }

  private findProducerOwner(room: RoomMedia, producerId: string) {
    for (const participant of room.participants.values()) {
      const producer = participant.producers.get(producerId);

      if (producer) {
        return {
          participantId: producer.appData.participantId,
          participantSessionId: producer.appData.participantSessionId,
          producerId,
        };
      }
    }

    return null;
  }

  private requireRoom(roomId: string): RoomMedia {
    const room = this.rooms.get(roomId);

    if (!room) {
      throw new MediaPlaneError(
        'MEDIA_ROOM_NOT_FOUND',
        `No media router exists for room ${roomId}.`
      );
    }

    return room;
  }

  private getOrCreateParticipant(room: RoomMedia, participantId: ParticipantId): ParticipantMedia {
    let participant = room.participants.get(participantId);

    if (!participant) {
      participant = {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      };

      room.participants.set(participantId, participant);
    }

    return participant;
  }

  private findTransport(transportId: string): WebRtcTransport {
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        const entry = participant.transports.get(transportId);

        if (entry) {
          return entry.transport;
        }
      }
    }

    throw new MediaPlaneError('TRANSPORT_NOT_FOUND', `Transport ${transportId} was not found.`);
  }

  private findParticipantByTransport(transportId: string): ParticipantMedia | null {
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        if (participant.transports.has(transportId)) {
          return participant;
        }
      }
    }

    return null;
  }

  private findRoomByTransport(transportId: string): RoomMedia | null {
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        if (participant.transports.has(transportId)) {
          return room;
        }
      }
    }

    return null;
  }
}
