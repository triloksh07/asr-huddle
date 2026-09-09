import { describe, expect, it } from "vitest";
import {
  createRoom,
  createRoomSession,
  endRoom,
  isExpired,
  markExpiryWarningIssued,
  shouldIssueExpiryWarning,
  ROOM_DURATIONS_MINUTES,
} from "../src/room/index.js";
import { roomId, roomSessionId, userId } from "../src/shared.js";

describe("room domain", () => {
  const room = createRoom({
    id: roomId("room-1"),
    hostUserId: userId("user-1"),
    visibility: "PUBLIC",
    durationMinutes: ROOM_DURATIONS_MINUTES.ONE_HOUR,
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
  });

  it("creates a session with a deterministic expiry", () => {
    const session = createRoomSession({
      id: roomSessionId("session-1"),
      room,
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
    });

    expect(session.expiresAt.toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });

  it("issues the expiry warning only inside the five-minute window", () => {
    const session = createRoomSession({
      id: roomSessionId("session-2"),
      room,
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
    });

    expect(
      shouldIssueExpiryWarning(session, new Date("2026-01-01T10:54:59.999Z")),
    ).toBe(false);

    expect(
      shouldIssueExpiryWarning(session, new Date("2026-01-01T10:55:00.000Z")),
    ).toBe(true);

    const warned = markExpiryWarningIssued(
      session,
      new Date("2026-01-01T10:55:00.000Z"),
    );

    expect(shouldIssueExpiryWarning(warned, new Date("2026-01-01T10:56:00.000Z"))).toBe(false);
  });

  it("recognizes expiry at the exact deadline", () => {
    const session = createRoomSession({
      id: roomSessionId("session-3"),
      room,
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
    });

    expect(isExpired(session, new Date("2026-01-01T10:59:59.999Z"))).toBe(false);
    expect(isExpired(session, new Date("2026-01-01T11:00:00.000Z"))).toBe(true);
  });

  it("ending a room is idempotent", () => {
    const ended = endRoom(room, new Date("2026-01-01T10:20:00.000Z"));
    expect(endRoom(ended, new Date("2026-01-01T10:30:00.000Z"))).toEqual(ended);
  });
});
