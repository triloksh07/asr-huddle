import * as mediasoup from 'mediasoup';
import { config } from '../config.js';

const workers = [];
let nextWorkerIdx = 0;

export async function createWorkerPool() {
  const { numWorkers, workerSettings } = config.mediasoup;
  console.log(`[Mediasoup] Spawning ${numWorkers} C++ Worker processes...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker(workerSettings);

    worker.on('died', () => {
      console.error(`[Mediasoup] Worker ${worker.pid} died abruptly. Exiting...`);
      process.exit(1);
    });

    workers.push(worker);
  }

  console.log(`[Mediasoup] Worker pool ready with ${workers.length} workers.`);
}

/**
 * Retrieves the next available worker using round-robin allocation
 */
export function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}
