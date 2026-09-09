export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type UserId = Brand<string, "UserId">;
export type RoomId = Brand<string, "RoomId">;
export type RoomSessionId = Brand<string, "RoomSessionId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type ParticipantSessionId = Brand<string, "ParticipantSessionId">;
export type ConnectionId = Brand<string, "ConnectionId">;
export type SpeakerRequestId = Brand<string, "SpeakerRequestId">;
export type InvitationId = Brand<string, "InvitationId">;

export function userId(value: string): UserId { return value as UserId; }
export function roomId(value: string): RoomId { return value as RoomId; }
export function roomSessionId(value: string): RoomSessionId { return value as RoomSessionId; }
export function participantId(value: string): ParticipantId { return value as ParticipantId; }
export function participantSessionId(value: string): ParticipantSessionId { return value as ParticipantSessionId; }
export function connectionId(value: string): ConnectionId { return value as ConnectionId; }
export function speakerRequestId(value: string): SpeakerRequestId { return value as SpeakerRequestId; }
export function invitationId(value: string): InvitationId { return value as InvitationId; }

export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
