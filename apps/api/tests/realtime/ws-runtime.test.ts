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
      listeners.get(event)?.(value);
    },
  };
}

describe("createRealtimeRuntime", () => {
  it("authenticates before registering a websocket connection", async () => {
    const router = new CommandRouter();
    const registry = new ConnectionRegistry();
    const authenticate = vi.fn().mockResolvedValue("user-1");

    const runtime = createRealtimeRuntime(
      router,
      registry,
      { authenticate },
    );

    const ws = socket();
    await runtime.accept(ws, { headers: {} });

    expect(authenticate).toHaveBeenCalledOnce();
    expect(registry.size()).toBe(1);
  });

  it("rejects malformed JSON without crashing the socket handler", async () => {
    const router = new CommandRouter();
    const registry = new ConnectionRegistry();

    const runtime = createRealtimeRuntime(
      router,
      registry,
      { authenticate: vi.fn().mockResolvedValue("user-1") },
    );

    const ws = socket();
    await runtime.accept(ws, {});

    await ws.emit("message", "{not-json");

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"code":"INVALID_MESSAGE"'),
    );
  });

  it("removes the connection when the websocket closes", async () => {
    const router = new CommandRouter();
    const registry = new ConnectionRegistry();

    const runtime = createRealtimeRuntime(
      router,
      registry,
      { authenticate: vi.fn().mockResolvedValue("user-1") },
    );

    const ws = socket();
    await runtime.accept(ws, {});
    expect(registry.size()).toBe(1);

    ws.emit("close");

    expect(registry.size()).toBe(0);
  });
});
