import { describe, expect, it, vi } from "vitest";
import {
  CommandRouter,
  ConnectionRegistry,
  createRealtimeRuntime,
} from "../../src/realtime/index.js";

function socket() {
  const listeners = new Map<string, (value?: unknown) => void>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, listener: (value?: unknown) => void) => {
      listeners.set(event, listener);
    }),
    emit(event: string, value?: unknown) {
      return listeners.get(event)?.(value);
    },
  };
}

function runtime(options: { maxMessageBytes?: number; maxProtocolViolations?: number } = {}) {
  const router = new CommandRouter();
  const registry = new ConnectionRegistry();
  const authenticator = { authenticate: vi.fn().mockResolvedValue("user-1") };
  const disconnectRoom = { execute: vi.fn().mockResolvedValue(undefined) };

  return {
    runtime: createRealtimeRuntime(
      router,
      registry,
      authenticator,
      disconnectRoom as never,
      {} as never,
      15_000,
      undefined,
      undefined,
      options.maxMessageBytes,
      options.maxProtocolViolations
    ),
    registry,
  };
}

describe("createRealtimeRuntime B20.2 protocol boundary", () => {
  it("accepts websocket text and Buffer JSON frames", async () => {
    const { runtime, registry } = runtime();
    const ws = socket();
    await runtime.accept(ws, {});

    await ws.emit("message", JSON.stringify({
      requestId: "r1",
      type: "unknown.command",
      payload: {},
    }));
    await ws.emit("message", Buffer.from(JSON.stringify({
      requestId: "r2",
      type: "unknown.command",
      payload: {},
    })));

    expect(registry.size()).toBe(1);
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized messages with websocket code 1009", async () => {
    const { runtime } = runtime({ maxMessageBytes: 16 });
    const ws = socket();
    await runtime.accept(ws, {});

    await ws.emit("message", JSON.stringify({
      requestId: "r1",
      type: "unknown.command",
      payload: {},
    }));

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("MESSAGE_TOO_LARGE"));
    expect(ws.close).toHaveBeenCalledWith(1009, "Message too large.");
  });

  it("closes after repeated malformed protocol messages", async () => {
    const { runtime } = runtime({ maxProtocolViolations: 2 });
    const ws = socket();
    await runtime.accept(ws, {});

    await ws.emit("message", "{bad");
    await ws.emit("message", "{bad");

    expect(ws.close).toHaveBeenCalledWith(1008, "Protocol violation limit exceeded.");
  });
});
