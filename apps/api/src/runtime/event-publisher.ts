import type { DomainEvent, EventPublisher } from '@repo/application';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REALTIME_EVENT_CHANNEL } from '../realtime/event-fanout.js';
import { REALTIME_EVENT_SEQUENCE_PREFIX } from '../realtime/event-sequence.js';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

const PUBLISH_EVENT_SCRIPT = `
local sequence = redis.call('INCR', KEYS[1])
local event = cjson.decode(ARGV[1])
event.sequence = sequence
redis.call('PUBLISH', KEYS[2], cjson.encode(event))
return sequence
`;

export class RedisEventPublisher implements EventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly metrics?: RuntimeMetrics,
    private readonly logger?: StructuredLogger
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    if (!event.roomId) {
      throw new Error('REALTIME_EVENT_ROOM_REQUIRED');
    }

    const published = {
      eventId: randomUUID(),
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      roomId: event.roomId,
      roomSessionId: event.roomSessionId,
      participantId: event.participantId,
      participantSessionId: event.participantSessionId,
      userId: event.userId,
      payload: event.payload,
    };

    const result = await this.redis.eval(
      PUBLISH_EVENT_SCRIPT,
      2,
      `${REALTIME_EVENT_SEQUENCE_PREFIX}${event.roomId}`,
      REALTIME_EVENT_CHANNEL,
      JSON.stringify(published)
    );

    const sequence = Number(result);
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error('REALTIME_EVENT_SEQUENCE_INVALID');
    }

    this.metrics?.recordEvent(event.type);
    this.logger?.info('domain_event_published', {
      eventId: published.eventId,
      sequence,
      type: event.type,
      roomId: event.roomId,
      participantId: event.participantId,
    });
  }
}
