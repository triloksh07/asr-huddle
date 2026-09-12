import {
  DomainError,
  type RoomId,
  type RoomSessionId,
  type UserId,
} from "../shared.js";

export const ROOM_DURATIONS_MINUTES = {
  ONE_HOUR: 60,
  TWO_HOURS: 120,
  FIVE_HOURS: 300,
} as const;

export type RoomDurationMinutes =
  (typeof ROOM_DURATIONS_MINUTES)[keyof typeof ROOM_DURATIONS_MINUTES];

export type RoomVisibility = "PUBLIC" | "LINK_ONLY";

export type RoomStatus = "ACTIVE" | "ENDED";

export type RoomState = Readonly<{
  id: RoomId;
  hostUserId: UserId;
  title?: string;
  description?: string;
  visibility: RoomVisibility;
  durationMinutes: RoomDurationMinutes;
  status: RoomStatus;
  createdAt: Date;
  endedAt: Date | null;
}>;

export type RoomSessionState = Readonly<{
  id: RoomSessionId;
  roomId: RoomId;
  startedAt: Date;
  expiresAt: Date;
  status: "ACTIVE" | "ENDED";
  expiryWarningIssuedAt: Date | null;
  endedAt: Date | null;
}>;

export function createRoom(input: {
  id: RoomId;
  hostUserId: UserId;
  title?: string;
  description?: string;
  visibility: RoomVisibility;
  durationMinutes: RoomDurationMinutes;
  createdAt: Date;
}): RoomState {
  return {
    id: input.id,
    hostUserId: input.hostUserId,
    title: input.title ?? "Untitled room",
    description: input.description ?? "",
    visibility: input.visibility,
    durationMinutes: input.durationMinutes,
    status: "ACTIVE",
    createdAt: input.createdAt,
    endedAt: null,
  };
}

export function createRoomSession(input: {
  id: RoomSessionId;
  room: RoomState;
  startedAt: Date;
}): RoomSessionState {
  if (input.room.status !== "ACTIVE") {
    throw new DomainError("ROOM_NOT_ACTIVE", "Cannot start a session for an ended room.");
  }

  const expiresAt = new Date(
    input.startedAt.getTime() + input.room.durationMinutes * 60_000,
  );

  return {
    id: input.id,
    roomId: input.room.id,
    startedAt: input.startedAt,
    expiresAt,
    status: "ACTIVE",
    expiryWarningIssuedAt: null,
    endedAt: null,
  };
}

export function endRoom(
  room: RoomState,
  endedAt: Date,
): RoomState {
  if (room.status === "ENDED") {
    return room;
  }

  return {
    ...room,
    status: "ENDED",
    endedAt,
  };
}

export function endRoomSession(
  session: RoomSessionState,
  endedAt: Date,
): RoomSessionState {
  if (session.status === "ENDED") {
    return session;
  }

  return {
    ...session,
    status: "ENDED",
    endedAt,
  };
}

export function shouldIssueExpiryWarning(
  session: RoomSessionState,
  now: Date,
  warningLeadMinutes = 5,
): boolean {
  if (session.status !== "ACTIVE" || session.expiryWarningIssuedAt !== null) {
    return false;
  }

  const warningAt =
    session.expiresAt.getTime() - warningLeadMinutes * 60_000;

  return now.getTime() >= warningAt && now.getTime() < session.expiresAt.getTime();
}

export function markExpiryWarningIssued(
  session: RoomSessionState,
  issuedAt: Date,
): RoomSessionState {
  if (session.status !== "ACTIVE") {
    throw new DomainError(
      "ROOM_SESSION_NOT_ACTIVE",
      "Cannot issue an expiry warning for an ended session.",
    );
  }

  if (session.expiryWarningIssuedAt !== null) {
    return session;
  }

  return {
    ...session,
    expiryWarningIssuedAt: issuedAt,
  };
}

export function isExpired(session: RoomSessionState, now: Date): boolean {
  return session.status === "ACTIVE" && now.getTime() >= session.expiresAt.getTime();
}
