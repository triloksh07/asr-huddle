import Redis from 'ioredis';
import { SfuRequestMessage, SfuResponseMessage } from '@repo/sfu-contract';
import { REDIS_KEYS } from '@repo/redis-models';
import { RoomRouterManager } from './roomRouterManager.js';
import { CONFIG } from './config.js';

export class SfuRedisSubscriber {
  private subClient: Redis;
  private pubClient: Redis;
  private routerManager: RoomRouterManager;

  constructor(routerManager: RoomRouterManager, redisUrl: string) {
    this.routerManager = routerManager;
    this.subClient = new Redis(redisUrl);
    this.pubClient = new Redis(redisUrl);
  }

  async listen(): Promise<void> {
    const channel = REDIS_KEYS.sfuCommandChannel(CONFIG.sfuId);

    await this.subClient.subscribe(channel);
    console.log(`[SFU] Subscribed to Redis channel: ${channel}`);

    this.subClient.on('message', async (ch, message) => {
      if (ch !== channel) return;

      try {
        const payload: SfuRequestMessage = JSON.parse(message);
        const responseChannel = `sfu:${CONFIG.sfuId}:res:${payload.requestId}`;

        try {
          const result = await this.routerManager.handleCommand(payload.command);
          const response: SfuResponseMessage = {
            requestId: payload.requestId,
            success: true,
            data: result,
          };
          await this.pubClient.publish(responseChannel, JSON.stringify(response));
        } catch (err: unknown) {
          const response: SfuResponseMessage = {
            requestId: payload.requestId,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown SFU processing error',
          };
          await this.pubClient.publish(responseChannel, JSON.stringify(response));
        }
      } catch (parseErr) {
        console.error('[SFU] Malformed Redis message payload:', parseErr);
      }
    });
  }

  async close(): Promise<void> {
    await this.subClient.quit();
    await this.pubClient.quit();
  }
}
