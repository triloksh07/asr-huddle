import type {
  ConsumeAudioCommand,
  ConsumeAudioResult,
  ConnectTransportCommand,
  CreateRoomMediaContext,
  CreateTransportResult,
  JoinMediaContext,
  MediaCapabilities,
  MediaProducerInfo,
  MediaService,
  MediaTransportDirection,
  MediaTransportId,
  ProduceAudioCommand,
  ProduceAudioResult,
} from '@repo/media-contract';
import type { ParticipantId, ParticipantSessionId } from '@repo/domain';
import * as mediasoup from 'mediasoup';
import type { Consumer, Producer, Router, WebRtcTransport, Worker } from 'mediasoup/types';
import { MediaPlaneError } from './errors.js';

interface ParticipantMedia {
  transports: Map<string, { transport: WebRtcTransport; direction: MediaTransportDirection }>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}
interface RoomMedia {
  router: Router;
  participants: Map<string, ParticipantMedia>;
}
export interface MediasoupServiceOptions {
  worker: Worker;
  mediaCodecs: mediasoup.types.RtpCodecCapability[];
  announcedAddress?: string;
}

export class MediasoupMediaService implements MediaService {
  private readonly rooms = new Map<string, RoomMedia>();
  constructor(private readonly options: MediasoupServiceOptions) {}

  async createRouter(context: CreateRoomMediaContext) {
    const existing = this.rooms.get(context.roomId);
    if (existing)
      return {
        routerId: existing.router.id,
        rtpCapabilities: existing.router.rtpCapabilities as unknown as MediaCapabilities,
      };
    const router = await this.options.worker.createRouter({
      mediaCodecs: this.options.mediaCodecs,
    });
    this.rooms.set(context.roomId, { router, participants: new Map() });
    router.observer.on('close', () => this.rooms.delete(context.roomId));
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
          announcedAddress: this.options.announcedAddress,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: {
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        direction,
      },
    });
    participant.transports.set(transport.id, { transport, direction });
    transport.observer.on('close', () => participant.transports.delete(transport.id));
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
    await this.findTransport(command.transportId).connect({
      dtlsParameters: command.dtlsParameters as never,
    });
  }

  async produceAudio(command: ProduceAudioCommand): Promise<ProduceAudioResult> {
    const transport = this.findTransport(command.transportId);
    const owner = this.findParticipantByTransport(transport.id);
    if (!owner)
      throw new MediaPlaneError('MEDIA_OWNER_NOT_FOUND', 'Producer owner could not be resolved.');
    const entry = owner.transports.get(transport.id);
    if (!entry || entry.direction !== 'send')
      throw new MediaPlaneError(
        'INVALID_PRODUCER_TRANSPORT',
        'Audio production requires a send transport.'
      );
    if (owner.producers.size)
      throw new MediaPlaneError(
        'AUDIO_PRODUCER_ALREADY_EXISTS',
        'Participant already has an audio producer.'
      );
    if (
      command.appData.participantId !== transport.appData.participantId ||
      command.appData.participantSessionId !== transport.appData.participantSessionId
    )
      throw new MediaPlaneError(
        'MEDIA_IDENTITY_MISMATCH',
        'Producer identity does not match transport ownership.'
      );

    const producer = await transport.produce({
      kind: 'audio',
      rtpParameters: command.rtpParameters as never,
      appData: command.appData,
    });
    owner.producers.set(producer.id, producer);
    producer.observer.on('close', () => owner.producers.delete(producer.id));
    return { producerId: producer.id as never };
  }

  async consumeAudio(command: ConsumeAudioCommand): Promise<ConsumeAudioResult> {
    const room = this.requireRoom(command.roomId);
    const participant = this.getOrCreateParticipant(room, command.participantId);
    if (
      !room.router.canConsume({
        producerId: command.producerId,
        rtpCapabilities: command.rtpCapabilities as never,
      })
    )
      throw new MediaPlaneError(
        'CANNOT_CONSUME',
        'The participant RTP capabilities cannot consume this producer.'
      );

    const entry = [...participant.transports.values()].find(
      item => !item.transport.closed && item.direction === 'recv'
    );
    if (!entry)
      throw new MediaPlaneError(
        'CONSUMER_TRANSPORT_NOT_FOUND',
        'No active receive WebRTC transport exists.'
      );

    if (
      entry.transport.appData.participantId !== command.participantId ||
      entry.transport.appData.participantSessionId !== command.participantSessionId
    )
      throw new MediaPlaneError(
        'MEDIA_IDENTITY_MISMATCH',
        'Consumer identity does not match transport ownership.'
      );

    const consumer = await entry.transport.consume({
      producerId: command.producerId,
      rtpCapabilities: command.rtpCapabilities as never,
      paused: true,
      appData: {
        participantId: command.participantId,
        participantSessionId: command.participantSessionId,
      },
    });
    participant.consumers.set(consumer.id, consumer);
    consumer.observer.on('close', () => participant.consumers.delete(consumer.id));
    return {
      consumerId: consumer.id as never,
      producerId: command.producerId,
      kind: 'audio',
      rtpParameters: consumer.rtpParameters,
    };
  }

  async listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]> {
    const room = this.requireRoom(context.roomId);
    const result: MediaProducerInfo[] = [];
    for (const participant of room.participants.values())
      for (const producer of participant.producers.values()) {
        if (!producer.closed && producer.kind === 'audio')
          result.push({
            producerId: producer.id as never,
            participantId: producer.appData.participantId as ParticipantId,
            participantSessionId: producer.appData.participantSessionId as ParticipantSessionId,
            kind: 'audio',
          });
      }
    return result;
  }

  async closeParticipantMedia(context: JoinMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);
    if (!room) return;
    const participant = room.participants.get(context.participantId);
    if (!participant) return;
    for (const consumer of participant.consumers.values()) consumer.close();
    for (const producer of participant.producers.values()) producer.close();
    for (const entry of participant.transports.values()) entry.transport.close();
    room.participants.delete(context.participantId);
  }

  async closeRoomMedia(context: CreateRoomMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);
    if (!room) return;
    room.router.close();
    this.rooms.delete(context.roomId);
  }

  diagnostics(): { activeRooms: number; activeTransports: number; activeProducers: number; activeConsumers: number } {
    let activeTransports = 0; let activeProducers = 0; let activeConsumers = 0;
    for (const room of this.rooms.values()) for (const participant of room.participants.values()) {
      activeTransports += participant.transports.size;
      activeProducers += participant.producers.size;
      activeConsumers += participant.consumers.size;
    }
    return { activeRooms: this.rooms.size, activeTransports, activeProducers, activeConsumers };
  }

  private requireRoom(roomId: string): RoomMedia {
    const room = this.rooms.get(roomId);
    if (!room)
      throw new MediaPlaneError(
        'MEDIA_ROOM_NOT_FOUND',
        `No media router exists for room ${roomId}.`
      );
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
    for (const room of this.rooms.values())
      for (const participant of room.participants.values()) {
        const entry = participant.transports.get(transportId);
        if (entry) return entry.transport;
      }
    throw new MediaPlaneError('TRANSPORT_NOT_FOUND', `Transport ${transportId} does not exist.`);
  }
  private findParticipantByTransport(transportId: string): ParticipantMedia | null {
    for (const room of this.rooms.values())
      for (const participant of room.participants.values())
        if (participant.transports.has(transportId)) return participant;
    return null;
  }
}
