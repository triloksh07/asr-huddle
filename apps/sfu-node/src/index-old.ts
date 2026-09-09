import { workerManager } from './sfuWorker.js';
import { RoomRouterManager } from './roomRouterManager.js';
import { SfuRedisSubscriber } from './redisSubscriber.js';
import { CONFIG } from './config.js';

async function main() {
  console.log(`Starting SFU Node: ${CONFIG.sfuId}`);

  await workerManager.init();
  console.log('Mediasoup Worker Pool initialized successfully.');

  const routerManager = new RoomRouterManager();

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redisSubscriber = new SfuRedisSubscriber(routerManager, redisUrl);
  await redisSubscriber.listen();

  process.on('SIGINT', async () => {
    console.log('Shutting down SFU Node...');
    await redisSubscriber.close();
    await workerManager.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error initializing SFU Node:', err);
  process.exit(1);
});