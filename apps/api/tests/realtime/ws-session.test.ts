import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../../src/realtime/command-router.js";
import { ConnectionRegistry } from "../../src/realtime/connection-registry.js";
import { createRealtimeSession } from "../../src/realtime/ws-session.js";

describe("realtime session", () => {
  it("registers a connection and dispatches commands", async () => {
    const registry = new ConnectionRegistry();
    const router = new CommandRouter();
    const transport = { send: vi.fn(), close: vi.fn() };

    router.register({
      type: "ping",
      handle: vi.fn().mockResolvedValue({ pong: true }),
    });

    const session = createRealtimeSession(
      "c1" as never,
      "u1" as never,
      transport,
      router,
      registry,
    );

    expect(registry.size()).toBe(1);

    await session.receive({
      requestId: "r1",
      type: "ping",
      payload: {},
    });

    expect(transport.send).toHaveBeenCalledWith({
      requestId: "r1",
      type: "ping.result",
      ok: true,
      payload: { pong: true },
    });
  });

  it("removes the connection on close", async () => {
    const registry = new ConnectionRegistry();
    const router = new CommandRouter();
    const transport = { send: vi.fn(), close: vi.fn() };

    const session = createRealtimeSession(
      "c1" as never,
      "u1" as never,
      transport,
      router,
      registry,
    );

    await session.close(1000, "normal");
    expect(registry.size()).toBe(0);
    expect(transport.close).toHaveBeenCalledWith(1000, "normal");
  });
});
