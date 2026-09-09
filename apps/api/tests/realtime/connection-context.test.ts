import { describe, expect, it } from "vitest";
import {
  bindRoomSession,
  clearRoomSessionBinding,
  type RealtimeConnectionContext,
} from "../../src/realtime/connection-context";

const context = (): RealtimeConnectionContext => ({
  connectionId: "connection-1" as RealtimeConnectionContext["connectionId"],
  userId: "user-1",
  roomId: null,
  roomSessionId: null,
  participantId: null,
  participantSessionId: null,
});

describe("realtime connection room-session binding", () => {
  it("binds the authoritative room and participant session", () => {
    const value = context();

    bindRoomSession(value, {
      roomId: "room-1" as never,
      roomSessionId: "room-session-1" as never,
      participantId: "participant-1" as never,
      participantSessionId: "participant-session-1" as never,
    });

    expect(value.roomId).toBe("room-1");
    expect(value.roomSessionId).toBe("room-session-1");
    expect(value.participantId).toBe("participant-1");
    expect(value.participantSessionId).toBe("participant-session-1");
  });

  it("rejects a second room binding on the same realtime connection", () => {
    const value = context();
    bindRoomSession(value, {
      roomId: "room-1" as never,
      roomSessionId: "room-session-1" as never,
      participantId: "participant-1" as never,
      participantSessionId: "participant-session-1" as never,
    });

    expect(() =>
      bindRoomSession(value, {
        roomId: "room-2" as never,
        roomSessionId: "room-session-2" as never,
        participantId: "participant-2" as never,
        participantSessionId: "participant-session-2" as never,
      }),
    ).toThrow("REALTIME_SESSION_ALREADY_BOUND");
  });

  it("clears the binding explicitly", () => {
    const value = context();
    bindRoomSession(value, {
      roomId: "room-1" as never,
      roomSessionId: "room-session-1" as never,
      participantId: "participant-1" as never,
      participantSessionId: "participant-session-1" as never,
    });

    clearRoomSessionBinding(value);

    expect(value.roomId).toBeNull();
    expect(value.roomSessionId).toBeNull();
    expect(value.participantId).toBeNull();
    expect(value.participantSessionId).toBeNull();
  });
});
