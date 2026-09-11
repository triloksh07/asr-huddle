import type { EventPublisher, DomainEvent } from "@repo/application";
import type { Redis } from "ioredis";
import { REALTIME_EVENT_CHANNEL } from "../realtime/event-fanout.js";

export class RedisEventPublisher implements EventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.redis.publish(REALTIME_EVENT_CHANNEL, JSON.stringify(event));
  }
}
