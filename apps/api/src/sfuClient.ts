import Redis from 'ioredis';
import crypto from 'node:crypto';
import { SfuCommand, SfuRequestMessage, SfuResponseMessage } from '@repo/sfu-contract';
import { REDIS_KEYS } from '@repo/redis-models';

export class SfuClient {
  private pubClient: Redis;
  private subClient: Redis;

  constructor(redisUrl: string) {
    this.pubClient = new Redis(redisUrl);
    this.subClient = new Redis(redisUrl);
  }

  async sendCommand(sfuId: string, command: SfuCommand, timeoutMs = 5000): Promise<unknown> {
    const requestId = crypto.randomUUID();
    const cmdChannel = REDIS_KEYS.sfuCommandChannel(sfuId);
    const resChannel = `sfu:${sfuId}:res:${requestId}`;

    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.subClient.unsubscribe(resChannel);
        reject(new Error(`SFU RPC Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      await this.subClient.subscribe(resChannel);

      const messageHandler = (ch: string, msg: string) => {
        if (ch !== resChannel) return;

        clearTimeout(timer);
        this.subClient.unsubscribe(resChannel);
        this.subClient.removeListener('message', messageHandler);

        try {
          const res: SfuResponseMessage = JSON.parse(msg);
          if (res.success) {
            resolve(res.data);
          } else {
            reject(new Error(res.error || 'SFU Execution Error'));
          }
        } catch (err) {
          reject(new Error('Failed to parse SFU response payload'));
        }
      };

      this.subClient.on('message', messageHandler);

      const requestPayload: SfuRequestMessage = {
        requestId,
        sfuId,
        command,
      };

      await this.pubClient.publish(cmdChannel, JSON.stringify(requestPayload));
    });
  }

  async close(): Promise<void> {
    await this.pubClient.quit();
    await this.subClient.quit();
  }
}
