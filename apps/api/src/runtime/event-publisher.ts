import type { DomainEvent, EventPublisher } from '@repo/application';
import { RedisSequencedRealtimeEventPublisher } from '@repo/redis-models';
import type { Redis } from 'ioredis';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';
export class RedisEventPublisher implements EventPublisher {
  private readonly publisher: RedisSequencedRealtimeEventPublisher;
  constructor(
    private readonly redis: Redis,
    private readonly metrics?: RuntimeMetrics,
    private readonly logger?: StructuredLogger
  ) {
    this.publisher = new RedisSequencedRealtimeEventPublisher(redis);
  }
  async publish(event: DomainEvent): Promise<void> {
    if (!event.roomId) throw new Error('REALTIME_EVENT_ROOM_REQUIRED');
    const published = await this.publisher.publish({
      roomId: event.roomId,
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      roomSessionId: event.roomSessionId,
      participantId: event.participantId,
      participantSessionId: event.participantSessionId,
      userId: event.userId,
      payload: event.payload,
    });
    this.metrics?.recordEvent(event.type);
    this.logger?.info('domain_event_published', {
      eventId: published.eventId,
      sequence: published.sequence,
      type: event.type,
      roomId: event.roomId,
      participantId: event.participantId,
    });
  }
}
