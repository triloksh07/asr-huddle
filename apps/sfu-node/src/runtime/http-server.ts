import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { MediaService } from '@repo/media-contract';
import { MediaRpcServer } from '../rpc/media-rpc-server.js';
import { SfuOperationalMetrics } from '../observability/sfu-operational-metrics.js';
import { SfuStructuredLogger } from '../observability/structured-logger.js';

type DiagnosableMediaService = MediaService & {
  diagnostics?: () => {
    activeRooms: number;
    activeTransports: number;
    activeProducers: number;
    activeConsumers: number;
  };
};

export function createSfuHttpServer(
  media: MediaService,
  options: {
    host?: string;
    port: number;
    mediaRpcSecret: string;
    metrics?: SfuOperationalMetrics;
    logger?: SfuStructuredLogger;
    isReady?: () => boolean;
  }
) {
  const metrics = options.metrics ?? new SfuOperationalMetrics();
  const logger = options.logger ?? new SfuStructuredLogger();
  const rpc = new MediaRpcServer(media, options.mediaRpcSecret, metrics, logger);

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (request.url === '/healthz' && request.method === 'GET') {
        const ready = options.isReady?.() ?? true;
        response.statusCode = ready ? 200 : 503;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: ready }));
        return;
      }

      if (request.url === '/metrics' && request.method === 'GET') {
        const diagnostics = (media as DiagnosableMediaService).diagnostics?.() ?? {
          activeRooms: 0,
          activeTransports: 0,
          activeProducers: 0,
          activeConsumers: 0,
        };

        response.statusCode = 200;
        response.setHeader('content-type', 'text/plain; version=0.0.4');
        response.end(
          [
            `asr_huddle_sfu_rooms_active ${diagnostics.activeRooms}`,
            `asr_huddle_sfu_transports_active ${diagnostics.activeTransports}`,
            `asr_huddle_sfu_producers_active ${diagnostics.activeProducers}`,
            `asr_huddle_sfu_consumers_active ${diagnostics.activeConsumers}`,
            `process_resident_memory_bytes ${process.memoryUsage().rss}`,
            metrics.exposition().trimEnd(),
            '',
          ].join('\n')
        );
        return;
      }

      if (request.url === '/rpc/media') {
        await rpc.handle(request, response);
        return;
      }

      response.statusCode = 404;
      response.end();
    } catch (error) {
      logger.error('sfu_http_request_failed', {
        method: request.method ?? 'unknown',
        path: request.url ?? 'unknown',
        error: error instanceof Error ? error.message : 'unknown',
      });
      response.statusCode = 500;
      response.end('Internal server error.');
    }
  });

  server.listen(options.port, options.host ?? '0.0.0.0');
  return server;
}
