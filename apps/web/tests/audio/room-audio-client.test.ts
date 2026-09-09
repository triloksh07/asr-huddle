import { describe, expect, it } from "vitest";

describe("first browser audio slice", () => {
  it("documents the browser command sequence", () => {
    const sequence = [
      "room.join",
      "media.transport.create(send)",
      "media.transport.connect",
      "media.audio.produce",
      "media.transport.create(recv)",
      "media.transport.connect",
      "media.audio.producers",
      "media.audio.consume",
    ];
    expect(sequence[0]).toBe("room.join");
    expect(sequence).toContain("media.audio.produce");
    expect(sequence).toContain("media.audio.consume");
  });
});
