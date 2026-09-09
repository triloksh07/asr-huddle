import type {
  ConnectionId,
  ParticipantId,
  ParticipantSessionId,
  RoomId,
  RoomSessionId,
  SpeakerRequestId,
  UserId,
} from "@repo/domain";

export interface ActiveRoomState {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  status: "ACTIVE" | "ENDING";
  expiresAt: string;
  expiryWarningAt: string;
  hostParticipantId: ParticipantId | null;
  hostUserId: UserId | null;
  version: number;
}

export interface ActiveParticipantState {
  participantId: ParticipantId;
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantSessionId: ParticipantSessionId;
  userId: UserId;
  managementRole: "HOST" | "CO_HOST" | "NONE";
  audioRole: "SPEAKER" | "LISTENER";
  status: "CONNECTED" | "DISCONNECTED" | "LEFT" | "REMOVED";
  connectionId: ConnectionId | null;
  connectedAt: string;
  disconnectedAt: string | null;
  recoverableUntil: string | null;
  version: number;
}

export interface ActiveConnectionState {
  connectionId: ConnectionId;
  roomId: RoomId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  connectedAt: string;
  lastSeenAt: string;
}

export interface ReconnectLease {
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  userId: UserId;
  roomId: RoomId;
  expiresAt: string;
}

export interface SpeakerRequestState {
  requestId: SpeakerRequestId;
  roomId: RoomId;
  participantId: ParticipantId;
  userId: UserId;
  state: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "EXPIRED";
  requestedAt: string;
  resolvedAt: string | null;
}

export interface RoomMembership {
  roomId: RoomId;
  participantIds: ParticipantId[];
}

export interface ActiveCounts {
  total: number;
  speakers: number;
  listeners: number;
  coHosts: number;
}

export interface SpeakerRequestStore {
  get(roomId: RoomId, requestId: SpeakerRequestId): Promise<SpeakerRequestState | null>;
  listPending(roomId: RoomId): Promise<SpeakerRequestState[]>;
  put(request: SpeakerRequestState, ttlSeconds: number): Promise<void>;
  transition(
    roomId: RoomId,
    requestId: SpeakerRequestId,
    from: SpeakerRequestState["state"],
    to: SpeakerRequestState["state"],
    resolvedAt: string | null,
  ): Promise<boolean>;
  remove(roomId: RoomId, requestId: SpeakerRequestId): Promise<void>;
}