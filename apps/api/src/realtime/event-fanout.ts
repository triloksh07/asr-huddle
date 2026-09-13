import type { Redis } from 'ioredis';
import { REALTIME_EVENT_CHANNEL } from '@repo/redis-models';
import type { ConnectionRegistry } from './connection-registry.js';
import type { RealtimeEvent } from './types.js';

export { REALTIME_EVENT_CHANNEL } from '@repo/redis-models';

interface PublishedRealtimeEvent {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  roomId: string;
  roomSessionId?: string;
  participantId?: string;
  participantSessionId?: string;
  userId?: string;
  payload?: unknown;
}
export class RedisRealtimeEventFanout {
  private readonly subscriber: Redis;
  private started = false;
  constructor(
    private readonly redis: Redis,
    private readonly registry: ConnectionRegistry,
    private readonly onRoomEnded?: (roomId: string, reason: string) => Promise<void>
  ) {
    this.subscriber = redis.duplicate();
  }
  async start(): Promise<void> {
    if (this.started) return;
    await this.subscriber.connect();
    await this.subscriber.subscribe(REALTIME_EVENT_CHANNEL);
    this.subscriber.on('message', (_channel, raw) => {
      void this.handle(raw);
    });
    this.started = true;
  }
  private async handle(raw: string): Promise<void> {
    let event: PublishedRealtimeEvent;
    try {
      event = JSON.parse(raw) as PublishedRealtimeEvent;
    } catch {
      console.error('Ignoring malformed realtime event.');
      return;
    }
    if (
      !event.roomId ||
      typeof event.eventId !== 'string' ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 1 ||
      typeof event.type !== 'string' ||
      typeof event.occurredAt !== 'string'
    ) {
      console.error('Ignoring invalid realtime event envelope.');
      return;
    }
    const message: RealtimeEvent = {
      eventId: event.eventId,
      sequence: event.sequence,
      type: event.type,
      occurredAt: event.occurredAt,
      roomId: event.roomId as RealtimeEvent['roomId'],
      payload: event.payload ?? {},
    };
    await this.registry.broadcastRoom(
      event.roomId as Parameters<ConnectionRegistry['broadcastRoom']>[0],
      message
    );
    if (event.type === 'room.ended') {
      const reason =
        typeof event.payload === 'object' &&
        event.payload !== null &&
        'reason' in event.payload &&
        typeof event.payload.reason === 'string'
          ? event.payload.reason
          : 'HOST_ENDED';
      await this.onRoomEnded?.(event.roomId, reason);
    }
  }
  async close(): Promise<void> {
    if (!this.started) {
      this.subscriber.disconnect();
      return;
    }
    await this.subscriber.unsubscribe(REALTIME_EVENT_CHANNEL);
    await this.subscriber.quit();
    this.started = false;
  }
}
