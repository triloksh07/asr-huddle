import type { Redis } from "ioredis";
import type { ParticipantSessionId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";
import { encodeJson } from "./codec.js";
import type { ReconnectLease } from "./types.js";

export class RedisReconnectStore {
  constructor(private readonly redis: Redis) {}

  async put(lease: ReconnectLease, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      activeStateKeys.reconnect(lease.participantSessionId),
      encodeJson(lease),
      "EX",
      ttlSeconds,
    );
  }

  async get(participantSessionId: ParticipantSessionId): Promise<ReconnectLease | null> {
    const raw = await this.redis.get(activeStateKeys.reconnect(participantSessionId));
    return raw ? (JSON.parse(raw) as ReconnectLease) : null;
  }

  async remove(participantSessionId: ParticipantSessionId): Promise<void> {
    await this.redis.del(activeStateKeys.reconnect(participantSessionId));
  }
}
