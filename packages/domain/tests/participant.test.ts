import { describe, expect, it } from "vitest";
import {
  createHostParticipant,
  createParticipant,
  demoteFromCoHost,
  demoteToListener,
  markSessionDisconnected,
  markSessionIntentionalLeave,
  canRecoverParticipantSession,
  promoteToCoHost,
  promoteToSpeaker,
} from "../src/participant/index.js";
import {
  connectionId,
  participantId,
  participantSessionId,
  roomId,
  roomSessionId,
  userId,
} from "../src/shared.js";

describe("participant domain", () => {
  const ids = {
    participant: participantId("participant-1"),
    room: roomId("room-1"),
    roomSession: roomSessionId("session-1"),
    user: userId("user-1"),
  };

  it("keeps management role and audio role separate", () => {
    const participant = createParticipant({
      id: ids.participant,
      roomId: ids.room,
      roomSessionId: ids.roomSession,
      userId: ids.user,
      joinedAt: new Date(),
    });

    const coHost = promoteToCoHost(participant);
    expect(coHost.managementRole).toBe("CO_HOST");
    expect(coHost.audioRole).toBe("SPEAKER");

    const demoted = demoteFromCoHost(coHost);
    expect(demoted.managementRole).toBe("NONE");
    expect(demoted.audioRole).toBe("SPEAKER");
  });

  it("does not allow a host to become a listener", () => {
    const host = createHostParticipant({
      id: ids.participant,
      roomId: ids.room,
      roomSessionId: ids.roomSession,
      userId: ids.user,
      joinedAt: new Date(),
    });

    expect(() => demoteToListener(host)).toThrow("A host or co-host cannot be demoted to listener.");
  });

  it("allows a listener to become a speaker", () => {
    const participant = createParticipant({
      id: ids.participant,
      roomId: ids.room,
      roomSessionId: ids.roomSession,
      userId: ids.user,
      joinedAt: new Date(),
    });

    expect(promoteToSpeaker(participant).audioRole).toBe("SPEAKER");
  });

  it("intentional leave prevents reconnect recovery", () => {
    const session = markSessionDisconnected(
      {
        id: participantSessionId("ps-1"),
        participantId: ids.participant,
        connectionId: connectionId("connection-1"),
        connectedAt: new Date("2026-01-01T10:00:00.000Z"),
        disconnectedAt: null,
        intentionalLeave: false,
        recoverableUntil: null,
      },
      new Date("2026-01-01T10:01:00.000Z"),
      new Date("2026-01-01T10:06:00.000Z"),
    );

    expect(canRecoverParticipantSession(
      session,
      new Date("2026-01-01T10:03:00.000Z"),
    )).toBe(true);

    const intentional = markSessionIntentionalLeave(session);

    expect(canRecoverParticipantSession(
      intentional,
      new Date("2026-01-01T10:03:00.000Z"),
    )).toBe(false);
  });
});
