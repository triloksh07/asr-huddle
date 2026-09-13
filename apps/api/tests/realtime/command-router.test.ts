import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@repo/application";
import { CommandRouter } from "../../src/realtime/command-router.js";

const context = {
  connection: {
    connectionId: "c1",
    userId: "u1",
    participantId: null,
    participantSessionId: null,
    roomId: null,
    connectedAt: new Date().toISOString(),
    roomSessionId: null,
  },
  transport: {
    send: vi.fn(),
    close: vi.fn(),
  },
};

describe("CommandRouter B20.2 protocol boundary", () => {
  it("rejects malformed envelopes", async () => {
    const router = new CommandRouter();
    const result = await router.dispatch(context, { type: "room.join" });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_MESSAGE");
  });

  it("rejects duplicate request ids on the same connection", async () => {
    const handler = {
      type: "room.test",
      handle: vi.fn().mockResolvedValue({ accepted: true }),
    };
    const router = new CommandRouter();
    router.register(handler);

    const first = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });
    const second = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });

    expect(first.ok).toBe(true);
    expect(second.error?.code).toBe("DUPLICATE_REQUEST_ID");
    expect(handler.handle).toHaveBeenCalledOnce();
  });

  it("scopes duplicate request ids to a connection", async () => {
    const handler = {
      type: "room.test",
      handle: vi.fn().mockResolvedValue({ accepted: true }),
    };
    const router = new CommandRouter();
    router.register(handler);

    const secondConnection = {
      ...context,
      connection: { ...context.connection, connectionId: "c2" },
    };

    await router.dispatch(context, {
      requestId: "same-id",
      type: "room.test",
      payload: {},
    });
    const result = await router.dispatch(secondConnection, {
      requestId: "same-id",
      type: "room.test",
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(handler.handle).toHaveBeenCalledTimes(2);
  });

  it("bounds the recent request-id cache", async () => {
    const handler = {
      type: "room.test",
      handle: vi.fn().mockResolvedValue({ accepted: true }),
    };
    const router = new CommandRouter({ maxRecentRequestIds: 2 });
    router.register(handler);

    for (const requestId of ["r1", "r2", "r3"]) {
      await router.dispatch(context, { requestId, type: "room.test", payload: {} });
    }

    const reused = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });

    expect(reused.ok).toBe(true);
    expect(handler.handle).toHaveBeenCalledTimes(4);
  });

  it("does not expose arbitrary infrastructure error messages", async () => {
    const handler = {
      type: "room.test",
      handle: vi.fn().mockRejectedValue(new Error("postgres connection string leaked")),
    };
    const router = new CommandRouter();
    router.register(handler);

    const result = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });

    expect(result.error).toEqual({
      code: "COMMAND_FAILED",
      message: "Realtime command failed.",
    });
  });

  it("preserves known application errors", async () => {
    const router = new CommandRouter();
    router.register({
      type: "room.test",
      handle: vi.fn().mockRejectedValue(
        new ApplicationError("FORBIDDEN", "Only the room host can end this room.")
      ),
    });

    const result = await router.dispatch(context, {
      requestId: "r1",
      type: "room.test",
      payload: {},
    });

    expect(result.error).toEqual({
      code: "FORBIDDEN",
      message: "Only the room host can end this room.",
    });
  });
});
