import type {
  ConsumeAudioCommand,
  ConsumeAudioResult,
  ConnectTransportCommand,
  CreateRoomMediaContext,
  CreateTransportResult,
  JoinMediaContext,
  MediaProducerInfo,
  MediaService,
  ProduceAudioCommand,
  ProduceAudioResult,
} from "@repo/media-contract";

export class UnconfiguredMediaService implements MediaService {
  async createRouter(_: CreateRoomMediaContext) {
    throw new Error("Media service is not configured.");
  }

  async createWebRtcTransport(_: JoinMediaContext): Promise<CreateTransportResult> {
    throw new Error("Media service is not configured.");
  }

  async connectWebRtcTransport(_: ConnectTransportCommand): Promise<void> {
    throw new Error("Media service is not configured.");
  }

  async produceAudio(_: ProduceAudioCommand): Promise<ProduceAudioResult> {
    throw new Error("Media service is not configured.");
  }

  async consumeAudio(_: ConsumeAudioCommand): Promise<ConsumeAudioResult> {
    throw new Error("Media service is not configured.");
  }

  async listAudioProducers(_: JoinMediaContext): Promise<MediaProducerInfo[]> {
    throw new Error("Media service is not configured.");
  }

  async closeParticipantMedia(_: JoinMediaContext): Promise<void> {
    throw new Error("Media service is not configured.");
  }

  async closeRoomMedia(_: CreateRoomMediaContext): Promise<void> {
    throw new Error("Media service is not configured.");
  }
}
