import type { Redis } from 'ioredis';
import type { RoomId } from '@repo/domain';

export const REALTIME_EVENT_SEQUENCE_PREFIX = 'asr-huddle:room-event-sequence:';

export class RedisRealtimeEventSequence {
  constructor(private readonly redis: Redis) {}

  async current(roomId: RoomId | string): Promise<number> {
    const value = await this.redis.get(this.key(roomId));
    if (value === null) return 0;
    const sequence = Number(value);
    return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
  }

  private key(roomId: RoomId | string): string {
    return `${REALTIME_EVENT_SEQUENCE_PREFIX}${roomId}`;
  }
}
