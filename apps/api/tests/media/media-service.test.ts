import { describe, expect, it } from "vitest";
import { UnconfiguredMediaService } from "../../src/media/media-service.js";

describe("UnconfiguredMediaService", () => {
  it("fails explicitly instead of silently accepting media operations", async () => {
    const service = new UnconfiguredMediaService();

    await expect(service.createRouter({
      roomId: "room-1" as never,
      roomSessionId: "session-1" as never,
    })).rejects.toThrow("Media service is not configured.");
  });
});
