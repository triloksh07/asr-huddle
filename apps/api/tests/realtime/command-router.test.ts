import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../../src/realtime/command-router.js";

describe("CommandRouter", () => {
  const context = {
    connection: {
      connectionId: "c1",
      userId: "u1",
      participantId: null,
      participantSessionId: null,
      roomId: null,
      connectedAt: new Date().toISOString(),
    },
    transport: {
      send: vi.fn(),
      close: vi.fn(),
    },
  };

  it("rejects malformed envelopes", async () => {
    const router = new CommandRouter();
    const result = await router.dispatch(context, { type: "room.join" });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_MESSAGE");
  });

  it("rejects unknown commands", async () => {
    const router = new CommandRouter();
    const result = await router.dispatch(context, {
      requestId: "r1",
      type: "unknown.command",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNSUPPORTED_COMMAND");
  });

  it("routes registered commands", async () => {
    const handler = {
      type: "room.test",
      handle: vi.fn().mockResolvedValue({ accepted: true }),
    };

    const router = new CommandRouter();
    router.register(handler);

    const result = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });

    expect(handler.handle).toHaveBeenCalledOnce();
    expect(result).toEqual({
      requestId: "r1",
      type: "room.test.result",
      ok: true,
      payload: { accepted: true },
    });
  });
});
