import type { Redis } from 'ioredis';
const PREFIX = 'asr-huddle:room-session-raised-hands:';
const TTL_SECONDS = 30 * 24 * 60 * 60;
export class RedisRaisedHandStore {
  constructor(private readonly redis: Redis) {}
  async list(roomSessionId: string): Promise<readonly string[]> {
    return this.redis.smembers(this.key(roomSessionId));
  }
  async set(roomSessionId: string, participantId: string, raised: boolean): Promise<void> {
    const key = this.key(roomSessionId);
    if (raised) await this.redis.sadd(key, participantId);
    else await this.redis.srem(key, participantId);
    await this.redis.expire(key, TTL_SECONDS);
  }
  private key(roomSessionId: string): string {
    return `${PREFIX}${roomSessionId}`;
  }
}
