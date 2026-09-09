import { describe, expect, it, vi } from "vitest";
import { createApiRuntime } from "../../src/runtime/app.js";

describe("API runtime media composition", () => {
  it("registers the V1 media command handlers", async () => {
    const media = {
      createWebRtcTransport: vi.fn(),
      connectWebRtcTransport: vi.fn(),
      produceAudio: vi.fn(),
      listAudioProducers: vi.fn(),
      consumeAudio: vi.fn(),
    } as never;

    const runtime = createApiRuntime({ media });

    const context = {
      connection: {
        connectionId: "c1" as never,
        userId: "u1" as never,
        participantId: "p1" as never,
        participantSessionId: "ps1" as never,
        roomId: "r1" as never,
        connectedAt: new Date().toISOString(),
      },
      transport: {
        send: vi.fn(),
        close: vi.fn(),
      },
    };

    const result = await runtime.router.dispatch(context, {
      requestId: "req-1",
      type: "media.transport.create",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(media.createWebRtcTransport).toHaveBeenCalledOnce();
  });
});
