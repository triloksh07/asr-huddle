import { describe, expect, it } from "vitest";
import { connectTransportSchema, produceAudioSchema } from "../src/validation.js";

describe("media contract validation", () => {
  it("accepts a transport connection payload", () => {
    expect(connectTransportSchema.parse({
      transportId: "t1",
      dtlsParameters: {},
    }).transportId).toBe("t1");
  });

  it("requires audio producers to identify their participant session", () => {
    expect(() => produceAudioSchema.parse({
      transportId: "t1",
      kind: "audio",
      rtpParameters: {},
      appData: { participantId: "p1" },
    })).toThrow();
  });
});
