import { describe, expect, it, vi } from "vitest";
import { ConnectionRegistry } from "../../src/realtime/connection-registry.js";

describe("ConnectionRegistry", () => {
  it("indexes active connections by user and participant", () => {
    const registry = new ConnectionRegistry();
    const transport = { send: vi.fn(), close: vi.fn() };

    registry.add({
      connectionId: "c1" as never,
      userId: "u1" as never,
      participantId: "p1" as never,
      participantSessionId: "ps1" as never,
      roomId: "r1" as never,
      connectedAt: new Date().toISOString(),
      transport,
    });

    expect(registry.get("c1" as never)?.userId).toBe("u1");
    expect(registry.getByUser("u1" as never)?.connectionId).toBe("c1");
    expect(registry.getByParticipant("p1" as never)?.connectionId).toBe("c1");
    expect(registry.size()).toBe(1);
  });
});
