import { describe, expect, it, vi } from "vitest";
import { createSfuHttpServer } from "../../src/runtime/http-server.js";

describe("SFU HTTP runtime", () => {
  it("exposes health and media RPC endpoints through one server", async () => {
    const media = {
      createWebRtcTransport: vi.fn().mockResolvedValue({
        transportId: "transport-1",
      }),
    } as never;

    const server = createSfuHttpServer(media, {
      host: "127.0.0.1",
      port: 0,
    });

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.once("listening", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Unable to resolve test server address.");
    }

    const health = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const rpc = await fetch(`http://127.0.0.1:${address.port}/rpc/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "req-1",
        method: "media.createTransport",
        params: {
          roomId: "r1",
          roomSessionId: "rs1",
          participantId: "p1",
          participantSessionId: "ps1",
        },
      }),
    });

    expect(rpc.status).toBe(200);
    expect(await rpc.json()).toMatchObject({
      requestId: "req-1",
      ok: true,
      result: { transportId: "transport-1" },
    });

    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  });
});
