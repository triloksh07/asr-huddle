import type { EventPublisher, DomainEvent } from '@repo/application';
import type { Redis } from 'ioredis';
import { REALTIME_EVENT_CHANNEL } from '../realtime/event-fanout.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

export class RedisEventPublisher implements EventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly metrics?: RuntimeMetrics,
    private readonly logger?: StructuredLogger
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.redis.publish(REALTIME_EVENT_CHANNEL, JSON.stringify(event));
    this.metrics?.recordEvent(event.type);
    this.logger?.info('domain_event_published', {
      type: event.type,
      roomId: event.roomId,
      participantId: event.participantId,
    });
  }
}
