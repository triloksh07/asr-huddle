import type { EventPublisher } from "@repo/application";
import type { Redis } from "ioredis";

const EVENT_CHANNEL = "asr-huddle:events";

export class RedisEventPublisher implements EventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: Parameters<EventPublisher["publish"]>[0]): Promise<void> {
    await this.redis.publish(EVENT_CHANNEL, JSON.stringify(event));
  }
}
