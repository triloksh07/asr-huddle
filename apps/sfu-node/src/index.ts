import { workerManager } from './sfuWorker.js';
import { RoomRouterManager } from './roomRouterManager.js';
import { CONFIG } from './config.js';

async function main() {
  console.log(`Starting SFU Node: ${CONFIG.sfuId}`);

  await workerManager.init();
  console.log('Mediasoup Worker Pool initialized successfully.');

  const routerManager = new RoomRouterManager();

  process.on('SIGINT', async () => {
    console.log('Shutting down SFU Node...');
    await workerManager.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error initializing SFU Node:', err);
  process.exit(1);
});