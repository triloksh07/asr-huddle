import {
  WebRtcTransport,
  DtlsParameters,
  RtpParameters,
  RtpCapabilities,
} from 'mediasoup/node/lib/types.js';
import { SfuCommand, TransportOptions } from '@repo/sfu-contract';
import { workerManager } from './sfuWorker.js';
import { RoomMediaState } from './types.js';
import { CONFIG } from './config.js';

export const MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];
export class RoomRouterManager {
  private rooms = new Map<string, RoomMediaState>();

  async handleCommand(cmd: SfuCommand): Promise<unknown> {
    switch (cmd.type) {
      case 'CREATE_ROUTER':
        return await this.createRoomRouter(cmd.payload.roomId);

      case 'CLOSE_ROUTER':
        return this.closeRoomRouter(cmd.payload.roomId);

      case 'CREATE_WEBRTC_TRANSPORT':
        return await this.createWebRtcTransport(
          cmd.payload.roomId,
          cmd.payload.userId,
          cmd.payload.direction
        );

      case 'CONNECT_WEBRTC_TRANSPORT':
        return await this.connectWebRtcTransport(
          cmd.payload.roomId,
          cmd.payload.transportId,
          cmd.payload.dtlsParameters as DtlsParameters
        );

      case 'PRODUCE':
        return await this.produceAudio(
          cmd.payload.roomId,
          cmd.payload.transportId,
          cmd.payload.rtpParameters as RtpParameters,
          cmd.payload.userId
        );

      case 'CONSUME':
        return await this.consumeAudio(
          cmd.payload.roomId,
          cmd.payload.transportId,
          cmd.payload.producerId,
          cmd.payload.rtpCapabilities as RtpCapabilities,
          cmd.payload.userId
        );

      case 'CLOSE_PRODUCER':
        return this.closeProducer(cmd.payload.roomId, cmd.payload.producerId);

      case 'CLOSE_CONSUMER':
        return this.closeConsumer(cmd.payload.roomId, cmd.payload.consumerId);

      default:
        throw new Error(`Unhandled SFU command type`);
    }
  }

  private async getOrCreateRoom(roomId: string): Promise<RoomMediaState> {
    console.log(`[SFU Node] [Router] Allocation requested for room: ${roomId}`);

    let room = this.rooms.get(roomId);
    if (!room) {
      const router = await workerManager.createRouter();
      room = {
        roomId,
        router,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        userTransports: new Map(),
      };
      this.rooms.set(roomId, room);

      console.log(
        `[SFU Node] [Router] Created new router ${router.id} for room: ${roomId} with codecs:`,
        MEDIA_CODECS
      );
    }
    return room;
  }

  private async createRoomRouter(roomId: string) {
    const room = await this.getOrCreateRoom(roomId);
    return {
      roomId: room.roomId,
      routerRtpCapabilities: room.router.rtpCapabilities,
    };
  }

  private closeRoomRouter(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: true };

    room.router.close();
    this.rooms.delete(roomId);
    return { success: true };
  }

  private async createWebRtcTransport(roomId: string, userId: string, direction: 'send' | 'recv') {
    const room = await this.getOrCreateRoom(roomId);

    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: CONFIG.listenIp, announcedIp: CONFIG.announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: { userId, direction },
    });

    room.transports.set(transport.id, transport);

    let userTransportSet = room.userTransports.get(userId);
    if (!userTransportSet) {
      userTransportSet = new Set();
      room.userTransports.set(userId, userTransportSet);
    }
    userTransportSet.add(transport.id);

    const options: TransportOptions = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };

    return { roomId, userId, transport: options };
  }

  private async connectWebRtcTransport(
    roomId: string,
    transportId: string,
    dtlsParameters: DtlsParameters
  ) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    await transport.connect({ dtlsParameters });
    return { success: true };
  }

  private async produceAudio(
    roomId: string,
    transportId: string,
    rtpParameters: RtpParameters,
    userId: string
  ) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = await transport.produce({
      kind: 'audio',
      rtpParameters,
      appData: { userId },
    });

    room.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      room.producers.delete(producer.id);
    });

    return { roomId, producerId: producer.id, userId };
  }

  private async consumeAudio(
    roomId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
    userId: string
  ) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId}`);
    }

    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      appData: { userId },
    });

    room.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      room.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      room.consumers.delete(consumer.id);
    });

    return {
      roomId,
      consumerId: consumer.id,
      producerId,
      rtpParameters: consumer.rtpParameters,
    };
  }

  private closeProducer(roomId: string, producerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: true };

    const producer = room.producers.get(producerId);
    if (producer) {
      producer.close();
      room.producers.delete(producerId);
    }
    return { success: true };
  }

  private closeConsumer(roomId: string, consumerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: true };

    const consumer = room.consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      room.consumers.delete(consumerId);
    }
    return { success: true };
  }
}
