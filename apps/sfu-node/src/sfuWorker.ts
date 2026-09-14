import * as mediasoup from 'mediasoup';
import { types } from 'mediasoup';
import os from 'node:os';
import { CONFIG } from './config.js';
import { SfuOperationalMetrics, SfuMetricName } from './observability/sfu-operational-metrics.js';
import { SfuStructuredLogger } from './observability/structured-logger.js';

class SfuWorkerManager {
  private workers: types.Worker[] = [];
  private nextWorkerIdx = 0;

  constructor(
    private readonly metrics = new SfuOperationalMetrics(),
    private readonly logger = new SfuStructuredLogger()
  ) {}

  async init(): Promise<void> {
    const numWorkers = Math.max(1, os.cpus().length);
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: CONFIG.rtcMinPort,
        rtcMaxPort: CONFIG.rtcMaxPort,
      });
      worker.on('died', () => {
        this.metrics.increment(SfuMetricName.WorkerFailuresTotal);
        this.logger.error('sfu_worker_died', { workerPid: worker.pid });
        process.exit(1);
      });
      this.workers.push(worker);
    }
    this.logger.info('sfu_workers_initialized', { workerCount: this.workers.length });
  }

  getNextWorker(): types.Worker {
    if (this.workers.length === 0) throw new Error('No Mediasoup workers initialized');
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  async createRouter(): Promise<types.Router> {
    const worker = this.getNextWorker();
    try {
      const router = await worker.createRouter({ mediaCodecs: CONFIG.mediaCodecs });
      this.metrics.increment(SfuMetricName.RouterCreationsTotal);
      return router;
    } catch (error) {
      this.metrics.increment(SfuMetricName.RouterFailuresTotal);
      this.logger.error('sfu_router_create_failed', {
        workerPid: worker.pid,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    for (const worker of this.workers) worker.close();
    this.workers = [];
    this.logger.info('sfu_workers_closed');
  }
}

export const workerManager = new SfuWorkerManager();
