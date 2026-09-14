import type { DomainEvent, EventPublisher } from '@repo/application';
import { RedisSequencedRealtimeEventPublisher } from '@repo/redis-models';
import type { Redis } from 'ioredis';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';
import { RuntimeMetricName } from '../observability/metric-vocabulary.js';

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

    const startedAt = performance.now();
    try {
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

      const durationMs = performance.now() - startedAt;
      this.metrics?.recordEvent(event.type);
      this.metrics?.observeHistogram(RuntimeMetricName.DomainEventPublishDurationMs, durationMs);
      this.logger?.info('domain_event_published', {
        eventId: published.eventId,
        sequence: published.sequence,
        type: event.type,
        roomId: event.roomId,
        roomSessionId: event.roomSessionId,
        participantId: event.participantId,
        participantSessionId: event.participantSessionId,
        userId: event.userId,
        durationMs,
      });
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.metrics?.observeHistogram(RuntimeMetricName.DomainEventPublishDurationMs, durationMs);
      this.logger?.error('realtime_event_publish_failed', {
        type: event.type,
        roomId: event.roomId,
        roomSessionId: event.roomSessionId,
        participantId: event.participantId,
        participantSessionId: event.participantSessionId,
        userId: event.userId,
        durationMs,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }
}
