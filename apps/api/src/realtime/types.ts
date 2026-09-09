import type { ConnectionId, ParticipantId, ParticipantSessionId, RoomId, UserId } from "@repo/domain";

export interface RealtimeConnection {
  connectionId: ConnectionId;
  userId: UserId;
  participantId: ParticipantId | null;
  participantSessionId: ParticipantSessionId | null;
  roomId: RoomId | null;
  connectedAt: string;
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
