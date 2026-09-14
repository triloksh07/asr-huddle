import { workerManager } from './sfuWorker.js';
import { MediasoupMediaService } from './media/mediasoup-service.js';
import { createSfuHttpServer } from './runtime/http-server.js';
import { CONFIG } from './config.js';
import { createRedisClient, RedisSequencedRealtimeEventPublisher } from '@repo/redis-models';
import { SfuOperationalMetrics } from './observability/sfu-operational-metrics.js';
import { SfuStructuredLogger } from './observability/structured-logger.js';

async function main(): Promise<void> {
  const metrics = new SfuOperationalMetrics();
  const logger = new SfuStructuredLogger();
  logger.info('sfu_starting', { sfuId: CONFIG.sfuId });

  const redisUrl = new URL(CONFIG.redisUrl);
  const redis = createRedisClient({
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    password: redisUrl.password || undefined,
  });

  await redis.connect();
  await workerManager.init();

  const worker = workerManager.getNextWorker();
  const media = new MediasoupMediaService({
    worker,
    mediaCodecs: CONFIG.mediaCodecs,
    announcedAddress: CONFIG.announcedAddress,
    realtimeEvents: new RedisSequencedRealtimeEventPublisher(redis),
    activeSpeakerThreshold: CONFIG.activeSpeakerThreshold,
    activeSpeakerIntervalMs: CONFIG.activeSpeakerIntervalMs,
    activeSpeakerMaxEntries: CONFIG.activeSpeakerMaxEntries,
    metrics,
    logger,
  });

  const server = createSfuHttpServer(media, {
    host: CONFIG.listenHost,
    port: CONFIG.port,
    mediaRpcSecret: CONFIG.mediaRpcSecret,
    metrics,
    logger,
    isReady: () => workerManager.isReady(),
  });

  logger.info('sfu_http_listening', { host: CONFIG.listenHost, port: CONFIG.port });

  const shutdown = async (signal: string) => {
    logger.info('sfu_shutdown_requested', { signal });

    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );

    await workerManager.close();
    await redis.quit();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(error => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'sfu_startup_failed',
      error: error instanceof Error ? error.message : 'unknown',
    })
  );
  process.exit(1);
});
