import { describe, expect, it, vi } from "vitest";
import { RpcMediaService } from "../../src/media/rpc-media-service.js";

describe("RpcMediaService", () => {
  it("sends typed media RPC requests and returns the SFU result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: "rpc-1",
        ok: true,
        result: {
          transportId: "transport-1",
          iceParameters: {},
          iceCandidates: [],
          dtlsParameters: {},
        },
      }),
    });

    const service = new RpcMediaService({
      baseUrl: "http://sfu:4001",
      fetchImpl,
    });

    const result = await service.createWebRtcTransport({
      roomId: "room-1" as never,
      roomSessionId: "room-session-1" as never,
      participantId: "participant-1" as never,
      participantSessionId: "participant-session-1" as never,
    });

    expect(result.transportId).toBe("transport-1");
    expect(fetchImpl).toHaveBeenCalledOnce();

    const request = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      method: "media.createTransport",
    });
  });

  it("turns SFU failures into MediaControlError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        requestId: "rpc-1",
        ok: false,
        error: { code: "MEDIA_ROOM_NOT_FOUND", message: "No media router exists." },
      }),
    });

    const service = new RpcMediaService({
      baseUrl: "http://sfu:4001",
      fetchImpl,
    });

    await expect(service.createWebRtcTransport({
      roomId: "room-1" as never,
      roomSessionId: "room-session-1" as never,
      participantId: "participant-1" as never,
      participantSessionId: "participant-session-1" as never,
    })).rejects.toMatchObject({
      code: "MEDIA_ROOM_NOT_FOUND",
    });
  });
});
