import type { ParticipantId, ParticipantSessionId, RoomId, RoomSessionId } from "@repo/domain";

export interface SfuRoomContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
}

export interface SfuParticipantContext extends SfuRoomContext {
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
}

export interface SfuRouter {
  id: string;
  rtpCapabilities: unknown;
}

export interface SfuTransport {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
}

export interface SfuProducer {
  id: string;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  kind: "audio";
}

export interface SfuConsumer {
  id: string;
  producerId: string;
  kind: "audio";
  rtpParameters: unknown;
}
