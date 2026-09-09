import type { Redis } from "ioredis";
import type { ConnectionId, ParticipantId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";
import { encodeJson } from "./codec.js";
import type { ActiveConnectionState } from "./types.js";

export class RedisConnectionStore {
  constructor(private readonly redis: Redis) {}

  async get(connectionId: ConnectionId): Promise<ActiveConnectionState | null> {
    const raw = await this.redis.get(activeStateKeys.connection(connectionId));
    return raw ? (JSON.parse(raw) as ActiveConnectionState) : null;
  }

  async put(state: ActiveConnectionState, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(activeStateKeys.connection(state.connectionId), encodeJson(state), "EX", ttlSeconds);
    pipeline.set(
      activeStateKeys.participantConnection(state.participantId),
      state.connectionId,
      "EX",
      ttlSeconds,
    );
    await pipeline.exec();
  }

  async getParticipantConnection(participantId: ParticipantId): Promise<ConnectionId | null> {
    const raw = await this.redis.get(activeStateKeys.participantConnection(participantId));
    return raw as ConnectionId | null;
  }

  async remove(state: ActiveConnectionState): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(activeStateKeys.connection(state.connectionId));
    pipeline.del(activeStateKeys.participantConnection(state.participantId));
    await pipeline.exec();
  }
}
