import type { ParticipantId, ParticipantSessionId, RoomId, RoomSessionId } from '@repo/domain';

export type MediaTransportId = string & { readonly __mediaTransportId: unique symbol };
export type MediaProducerId = string & { readonly __mediaProducerId: unique symbol };
export type MediaConsumerId = string & { readonly __mediaConsumerId: unique symbol };
export type MediaTransportDirection = 'send' | 'recv';

export interface CreateRoomMediaContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
}

export interface JoinMediaContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
}

export interface MediaCapabilities {
  codecs: unknown[];
  headerExtensions?: unknown[];
}

export interface CreateTransportResult {
  transportId: MediaTransportId;
  direction: MediaTransportDirection;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  rtpCapabilities: MediaCapabilities;
}

export interface ConnectTransportCommand {
  transportId: MediaTransportId;
  dtlsParameters: unknown;
}

export interface ProduceAudioCommand {
  transportId: MediaTransportId;
  kind: 'audio';
  rtpParameters: unknown;
  appData: {
    participantId: ParticipantId;
    participantSessionId: ParticipantSessionId;
  };
}

export interface ProduceAudioResult {
  producerId: MediaProducerId;
}

export interface ConsumeAudioCommand {
  roomId: RoomId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  producerId: MediaProducerId;
  rtpCapabilities: MediaCapabilities;
}

export interface ConsumeAudioResult {
  consumerId: MediaConsumerId;
  producerId: MediaProducerId;
  kind: 'audio';
  rtpParameters: unknown;
}

export interface MediaProducerInfo {
  producerId: MediaProducerId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  kind: 'audio';
}

export interface MediaAudioState {
  audioRole: 'SPEAKER' | 'LISTENER';
  selfMuted: boolean;
  moderatorMuted: boolean;
  canTransmitAudio: boolean;
}

export interface MediaService {
  createRouter(
    context: CreateRoomMediaContext
  ): Promise<{ routerId: string; rtpCapabilities: MediaCapabilities }>;
  createWebRtcTransport(
    context: JoinMediaContext,
    direction: MediaTransportDirection
  ): Promise<CreateTransportResult>;
  connectWebRtcTransport(command: ConnectTransportCommand): Promise<void>;
  produceAudio(command: ProduceAudioCommand): Promise<ProduceAudioResult>;
  consumeAudio(command: ConsumeAudioCommand): Promise<ConsumeAudioResult>;
  listAudioProducers(context: JoinMediaContext): Promise<MediaProducerInfo[]>;
  closeParticipantMedia(context: JoinMediaContext): Promise<void>;
  closeRoomMedia(context: CreateRoomMediaContext): Promise<void>;
}
