import type { DomainEvent } from "@repo/application";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import type { ConnectionRegistry } from "./connection-registry.js";
import type { RealtimeEvent } from "./types.js";

export const REALTIME_EVENT_CHANNEL = "asr-huddle:events";

export class RedisRealtimeEventFanout {
  private readonly subscriber: Redis;
  private started = false;

  constructor(
    private readonly redis: Redis,
    private readonly registry: ConnectionRegistry,
    private readonly onRoomEnded?: (roomId: string, reason: string) => Promise<void>,
  ) {
    this.subscriber = redis.duplicate();
  }

  async start(): Promise<void> {
    if (this.started) return;

    await this.subscriber.connect();
    await this.subscriber.subscribe(REALTIME_EVENT_CHANNEL);
    this.subscriber.on("message", (_channel, raw) => {
      void this.handle(raw);
    });

    this.started = true;
  }

  private async handle(raw: string): Promise<void> {
    let event: DomainEvent;
    try {
      event = JSON.parse(raw) as DomainEvent;
    } catch (error) {
      console.error("Ignoring malformed realtime event.", error);
      return;
    }

    if (!event.roomId) return;

    const message: RealtimeEvent = {
      type: event.type,
      payload: event.payload ?? event,
    };

    await this.registry.broadcastRoom(
      event.roomId as Parameters<ConnectionRegistry["broadcastRoom"]>[0],
      {
        requestId: randomUUID(),
        type: message.type,
        ok: true,
        payload: message.payload,
      },
    );

    if (event.type === "room.ended") {
      const reason =
        typeof event.payload === "object" &&
        event.payload !== null &&
        "reason" in event.payload &&
        typeof event.payload.reason === "string"
          ? event.payload.reason
          : "HOST_ENDED";
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
