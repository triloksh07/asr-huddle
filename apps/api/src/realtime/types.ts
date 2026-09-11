import type {
  ConnectionId,
  ParticipantId,
  ParticipantSessionId,
  RoomId,
  RoomSessionId,
  UserId,
} from "@repo/domain";

export interface RealtimeConnection {
  readonly connectionId: ConnectionId;
  readonly userId: UserId;
  participantId: ParticipantId | null;
  participantSessionId: ParticipantSessionId | null;
  roomId: RoomId | null;
  roomSessionId: RoomSessionId | null;
  readonly connectedAt: string;
}

export interface BoundRoomSession {
  readonly roomId: RoomId;
  readonly roomSessionId: RoomSessionId;
  readonly participantId: ParticipantId;
  readonly participantSessionId: ParticipantSessionId;
}

export function bindRoomSession(
  connection: RealtimeConnection,
  binding: BoundRoomSession,
): void {
  if (
    connection.roomId !== null ||
    connection.roomSessionId !== null ||
    connection.participantId !== null ||
    connection.participantSessionId !== null
  ) {
    throw new Error("REALTIME_SESSION_ALREADY_BOUND");
  }

  connection.roomId = binding.roomId;
  connection.roomSessionId = binding.roomSessionId;
  connection.participantId = binding.participantId;
  connection.participantSessionId = binding.participantSessionId;
}

export function clearRoomSessionBinding(connection: RealtimeConnection): void {
  connection.roomId = null;
  connection.roomSessionId = null;
  connection.participantId = null;
  connection.participantSessionId = null;
}

export interface RealtimeEnvelope<TPayload = unknown> {
  requestId: string;
  type: string;
  payload: TPayload;
}

export interface RealtimeResponse<TPayload = unknown> {
  requestId: string;
  type: string;
  ok: boolean;
  payload?: TPayload;
  error?: {
    code: string;
    message: string;
  };
}

export interface RealtimeEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export interface RealtimeTransport {
  send(response: RealtimeResponse): Promise<void>;
  close(code: number, reason: string): Promise<void>;
}

export interface RealtimeCommandContext {
  connection: RealtimeConnection;
  transport: RealtimeTransport;
}

export interface RealtimeCommandHandler<TPayload = unknown> {
  readonly type: string;
  handle(
    context: RealtimeCommandContext,
    envelope: RealtimeEnvelope<TPayload>,
  ): Promise<unknown>;
}
