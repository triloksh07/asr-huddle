import { workerManager } from './sfuWorker.js';
import { MediasoupMediaService } from './media/mediasoup-service.js';
import { createSfuHttpServer } from './runtime/http-server.js';
import { CONFIG } from './config.js';
import { createRedisClient, RedisSequencedRealtimeEventPublisher } from '@repo/redis-models';

async function main(): Promise<void> {
  console.log(`Starting SFU Node: ${CONFIG.sfuId}`);
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
  });
  const server = createSfuHttpServer(media, {
    host: CONFIG.listenHost,
    port: CONFIG.port,
    mediaRpcSecret: CONFIG.mediaRpcSecret,
  });
  console.log(`SFU media RPC listening on http://${CONFIG.listenHost}:${CONFIG.port}`);
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down SFU.`);
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
  console.error('Fatal SFU startup failure.', error);
  process.exit(1);
});
