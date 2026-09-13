import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export const REALTIME_EVENT_CHANNEL = 'asr-huddle:events';
export const REALTIME_EVENT_SEQUENCE_PREFIX = 'asr-huddle:room-event-sequence:';

const PUBLISH_EVENT_SCRIPT = `
local sequence = redis.call('INCR', KEYS[1])
local event = cjson.decode(ARGV[1])
event.sequence = sequence
redis.call('PUBLISH', KEYS[2], cjson.encode(event))
return sequence
`;

export interface SequencedRealtimeEventInput {
  readonly roomId: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: unknown;
  readonly roomSessionId?: string;
  readonly participantId?: string;
  readonly participantSessionId?: string;
  readonly userId?: string;
}

export class RedisSequencedRealtimeEventPublisher {
  constructor(private readonly redis: Redis) {}
  async publish(
    event: SequencedRealtimeEventInput
  ): Promise<{ eventId: string; sequence: number }> {
    const published = { eventId: randomUUID(), ...event };
    const result = await this.redis.eval(
      PUBLISH_EVENT_SCRIPT,
      2,
      `${REALTIME_EVENT_SEQUENCE_PREFIX}${event.roomId}`,
      REALTIME_EVENT_CHANNEL,
      JSON.stringify(published)
    );
    const sequence = Number(result);
    if (!Number.isSafeInteger(sequence) || sequence < 1)
      throw new Error('REALTIME_EVENT_SEQUENCE_INVALID');
    return { eventId: published.eventId, sequence };
  }
}
