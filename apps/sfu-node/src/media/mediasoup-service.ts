import type {
  ConsumeAudioCommand,
  ConsumeAudioResult,
  ConnectTransportCommand,
  CreateRoomMediaContext,
  CreateTransportResult,
  JoinMediaContext,
  MediaProducerInfo,
  MediaService,
  MediaTransportId,
  ProduceAudioCommand,
  ProduceAudioResult,
} from "@repo/media-contract";
import type { ParticipantId, ParticipantSessionId } from "@repo/domain";
import * as mediasoup from "mediasoup";
import type {
  Consumer,
  Producer,
  Router,
  WebRtcTransport,
  Worker,
} from "mediasoup/types";
import { MediaPlaneError } from "./errors.js";

interface ParticipantMedia {
  transports: Map<string, WebRtcTransport>;
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
}

export class MediasoupMediaService implements MediaService {
  private readonly rooms = new Map<string, RoomMedia>();

  constructor(private readonly options: MediasoupServiceOptions) {}

  async createRouter(context: CreateRoomMediaContext) {
    const existing = this.rooms.get(context.roomId);
    if (existing) {
      return {
        routerId: existing.router.id,
        rtpCapabilities: existing.router.rtpCapabilities,
      };
    }

    const router = await this.options.worker.createRouter({
      mediaCodecs: this.options.mediaCodecs,
    });

    this.rooms.set(context.roomId, {
      router,
      participants: new Map(),
    });

    router.observer.on("close", () => {
      this.rooms.delete(context.roomId);
    });

    return {
      routerId: router.id,
      rtpCapabilities: router.rtpCapabilities,
    };
  }

  async createWebRtcTransport(context: JoinMediaContext): Promise<CreateTransportResult> {
    const room = this.requireRoom(context.roomId);
    const participant = this.getOrCreateParticipant(room, context.participantId);

    const transport = await room.router.createWebRtcTransport({
      listenInfos: [{
        protocol: "udp",
        ip: "0.0.0.0",
        announcedAddress: process.env.SFU_ANNOUNCED_ADDRESS,
      }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: {
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
      },
    });

    participant.transports.set(transport.id, transport);

    transport.observer.on("close", () => {
      participant.transports.delete(transport.id);
    });

    return {
      transportId: transport.id as MediaTransportId,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectWebRtcTransport(command: ConnectTransportCommand): Promise<void> {
    const transport = this.findTransport(command.transportId);
    await transport.connect({ dtlsParameters: command.dtlsParameters as never });
  }

  async produceAudio(command: ProduceAudioCommand): Promise<ProduceAudioResult> {
    const transport = this.findTransport(command.transportId);
    const participantId = command.appData.participantId;
    const participant = this.findParticipantByTransport(transport.id);

    if (participant?.producers.size) {
      throw new MediaPlaneError(
        "AUDIO_PRODUCER_ALREADY_EXISTS",
        `Participant ${participantId} already has an audio producer.`,
      );
    }

    const producer = await transport.produce({
      kind: "audio",
      rtpParameters: command.rtpParameters as never,
      appData: command.appData,
    });

    const owner = this.findParticipantByTransport(transport.id);
    if (!owner) {
      producer.close();
      throw new MediaPlaneError("MEDIA_OWNER_NOT_FOUND", "Producer owner could not be resolved.");
    }

    owner.producers.set(producer.id, producer);
    producer.observer.on("close", () => owner.producers.delete(producer.id));

    return { producerId: producer.id as never };
  }

  async consumeAudio(command: ConsumeAudioCommand): Promise<ConsumeAudioResult> {
    const room = this.requireRoom(command as never);
    const participant = this.getOrCreateParticipant(room, command.participantId);

    if (!room.router.canConsume({
      producerId: command.producerId,
      rtpCapabilities: command.rtpCapabilities as never,
    })) {
      throw new MediaPlaneError(
        "CANNOT_CONSUME",
        "The participant's RTP capabilities cannot consume this producer.",
      );
    }

    const transport = [...participant.transports.values()].find((item) => !item.closed);
    if (!transport) {
      throw new MediaPlaneError("CONSUMER_TRANSPORT_NOT_FOUND", "No active WebRTC transport exists.");
    }

    const consumer = await transport.consume({
      producerId: command.producerId,
      rtpCapabilities: command.rtpCapabilities as never,
      paused: true,
      appData: {
        participantId: command.participantId,
        participantSessionId: command.participantSessionId,
      },
    });

    participant.consumers.set(consumer.id, consumer);
    consumer.observer.on("close", () => participant.consumers.delete(consumer.id));

    return {
      consumerId: consumer.id as never,
      producerId: command.producerId,
      kind: "audio",
      rtpParameters: consumer.rtpParameters,
    };
  }

  async listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]> {
    const room = this.requireRoom(context.roomId);
    const result: MediaProducerInfo[] = [];

    for (const participant of room.participants.values()) {
      for (const producer of participant.producers.values()) {
        if (!producer.closed && producer.kind === "audio") {
          result.push({
            producerId: producer.id as never,
            participantId: producer.appData.participantId as ParticipantId,
            participantSessionId: producer.appData.participantSessionId as ParticipantSessionId,
            kind: "audio",
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

    for (const consumer of participant.consumers.values()) consumer.close();
    for (const producer of participant.producers.values()) producer.close();
    for (const transport of participant.transports.values()) transport.close();

    room.participants.delete(context.participantId);
  }

  async closeRoomMedia(context: CreateRoomMediaContext): Promise<void> {
    const room = this.rooms.get(context.roomId);
    if (!room) return;

    room.router.close();
    this.rooms.delete(context.roomId);
  }

  private requireRoom(roomId: string): RoomMedia {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new MediaPlaneError("MEDIA_ROOM_NOT_FOUND", `No media router exists for room ${roomId}.`);
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
        const transport = participant.transports.get(transportId);
        if (transport) return transport;
      }
    }
    throw new MediaPlaneError("TRANSPORT_NOT_FOUND", `Transport ${transportId} does not exist.`);
  }

  private findParticipantByTransport(transportId: string): ParticipantMedia | null {
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        if (participant.transports.has(transportId)) return participant;
      }
    }
    return null;
  }
}
