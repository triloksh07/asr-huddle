import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { MediaService } from '@repo/media-contract';
import { MediaRpcServer } from '../rpc/media-rpc-server.js';

export function createSfuHttpServer(media: MediaService, options: { host?: string; port: number }) {
  const rpc = new MediaRpcServer(media);
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (request.url === '/healthz' && request.method === 'GET') {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.url === '/rpc/media') {
        await rpc.handle(request, response);
        return;
      }
      response.statusCode = 404;
      response.end();
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : 'Internal server error.');
    }
  });
  server.listen(options.port, options.host ?? '0.0.0.0');
  return server;
}
