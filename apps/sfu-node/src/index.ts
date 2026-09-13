import { workerManager } from './sfuWorker.js';
import { MediasoupMediaService } from './media/mediasoup-service.js';
import { createSfuHttpServer } from './runtime/http-server.js';
import { CONFIG } from './config.js';

async function main(): Promise<void> {
  console.log(`Starting SFU Node: ${CONFIG.sfuId}`);
  await workerManager.init();

  const worker = workerManager.getNextWorker();
  const media = new MediasoupMediaService({
    worker,
    mediaCodecs: CONFIG.mediaCodecs,
    announcedAddress: CONFIG.announcedAddress,
  });

  const server = createSfuHttpServer(media, {
    host: CONFIG.listenHost,
    port: CONFIG.port,
  });

  console.log(`SFU media RPC listening on http://${CONFIG.listenHost}:${CONFIG.port}`);

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down SFU.`);
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    await workerManager.close();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(error => {
  console.error('Fatal SFU startup failure.', error);
  process.exit(1);
});
