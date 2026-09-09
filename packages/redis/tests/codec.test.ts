import { describe, expect, it } from "vitest";
import { decodeActiveParticipant, decodeActiveRoom } from "../src/codec";

describe("active state codecs", () => {
  it("rejects malformed room state", () => {
    expect(() => decodeActiveRoom(JSON.stringify({ roomId: "r" }))).toThrow();
  });

  it("validates participant state", () => {
    const value = decodeActiveParticipant(JSON.stringify({
      participantId: "p",
      roomId: "r",
      roomSessionId: "rs",
      participantSessionId: "ps",
      userId: "u",
      managementRole: "NONE",
      audioRole: "LISTENER",
      status: "CONNECTED",
      connectionId: null,
      connectedAt: "2026-09-10T00:00:00.000Z",
      disconnectedAt: null,
      recoverableUntil: null,
      version: 0
    }));
    expect(value.audioRole).toBe("LISTENER");
  });
});
