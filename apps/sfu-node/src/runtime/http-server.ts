import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { MediaService } from "@repo/media-contract";
import { MediaRpcServer } from "../rpc/media-rpc-server.js";

export interface SfuHttpServerOptions {
  host?: string;
  port: number;
}

export function createSfuHttpServer(
  media: MediaService,
  options: SfuHttpServerOptions,
) {
  const rpc = new MediaRpcServer(media);

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url === "/healthz" && request.method === "GET") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === "/rpc/media") {
      await rpc.handle(request, response);
      return;
    }

    response.statusCode = 404;
    response.end();
  }).listen(options.port, options.host ?? "0.0.0.0");
}
