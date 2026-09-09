import type {
  ConnectionId,
  ParticipantId,
  ParticipantSessionId,
  RoomId,
  RoomSessionId,
} from "@repo/domain";

export interface RealtimeConnectionContext {
  readonly connectionId: ConnectionId;
  readonly userId: string;
  roomId: RoomId | null;
  roomSessionId: RoomSessionId | null;
  participantId: ParticipantId | null;
  participantSessionId: ParticipantSessionId | null;
}

export interface BoundRoomSession {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
}

export function bindRoomSession(
  context: RealtimeConnectionContext,
  binding: BoundRoomSession,
): void {
  if (context.roomId !== null || context.participantId !== null) {
    throw new Error("REALTIME_SESSION_ALREADY_BOUND");
  }

  context.roomId = binding.roomId;
  context.roomSessionId = binding.roomSessionId;
  context.participantId = binding.participantId;
  context.participantSessionId = binding.participantSessionId;
}

export function clearRoomSessionBinding(
  context: RealtimeConnectionContext,
): void {
  context.roomId = null;
  context.roomSessionId = null;
  context.participantId = null;
  context.participantSessionId = null;
}
