import * as mediasoup from 'mediasoup';
import { Worker, Router } from 'mediasoup/node/lib/types.js';
import os from 'node:os';
import { CONFIG } from './config.js';

class SfuWorkerManager {
  private workers: Worker[] = [];
  private nextWorkerIdx = 0;

  async init(): Promise<void> {
    const numWorkers = Math.max(1, os.cpus().length);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: CONFIG.rtcMinPort,
        rtcMaxPort: CONFIG.rtcMaxPort,
      });

      worker.on('died', () => {
        console.error(`Mediasoup worker ${worker.pid} died! Exiting process...`);
        process.exit(1);
      });

      this.workers.push(worker);
    }
  }

  getNextWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error('No Mediasoup workers initialized');
    }
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  async createRouter(): Promise<Router> {
    const worker = this.getNextWorker();
    return await worker.createRouter({ mediaCodecs: CONFIG.mediaCodecs });
  }

  async close(): Promise<void> {
    for (const worker of this.workers) {
      worker.close();
    }
  }
}

export const workerManager = new SfuWorkerManager();