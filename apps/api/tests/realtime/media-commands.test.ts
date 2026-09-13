import { describe, expect, it, vi } from "vitest";
import {
  CommandRouter,
  CreateMediaTransportCommand,
  ConnectionRegistry,
} from "../../src/realtime/index.js";
import type { RealtimeCommandContext } from "../../src/realtime/types.js";

describe("media realtime commands", () => {
  it("routes media transport creation through the media controller", async () => {
    const media = {
      createTransport: vi.fn().mockResolvedValue({
        transportId: "transport-1",
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      }),
    };

    const router = new CommandRouter();
    router.register(new CreateMediaTransportCommand(media as never));

    const context: RealtimeCommandContext = {
      connection: {
        connectionId: "connection-1" as never,
        userId: "user-1" as never,
        participantId: "participant-1" as never,
        participantSessionId: "session-1" as never,
        roomId: "room-1" as never,
        connectedAt: new Date().toISOString(),
        roomSessionId: null
      },
      transport: {
        send: vi.fn(),
        close: vi.fn(),
      },
    };

    const result = await router.dispatch(context, {
      requestId: "request-1",
      type: "media.transport.create",
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({ transportId: "transport-1" });
  });
});
