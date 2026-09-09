import { describe, expect, it, vi } from "vitest";
import { MediaRpcServer } from "../../src/rpc/media-rpc-server.js";

describe("MediaRpcServer", () => {
  it("dispatches createTransport to MediaService", async () => {
    const media = {
      createWebRtcTransport: vi.fn().mockResolvedValue({
        transportId: "transport-1",
      }),
    } as never;

    const server = new MediaRpcServer(media);

    const response = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      end: vi.fn(),
    };

    const request = {
      method: "POST",
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({
          requestId: "request-1",
          method: "media.createTransport",
          params: {
            roomId: "room-1",
            roomSessionId: "session-1",
            participantId: "participant-1",
            participantSessionId: "participant-session-1",
          },
        }));
      },
    };

    await server.handle(request as never, response as never);

    expect(media.createWebRtcTransport).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining('"ok":true'),
    );
  });
});
