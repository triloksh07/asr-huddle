import type { Redis } from "ioredis";
import type { ParticipantId, RoomId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";
import { decodeActiveParticipant, encodeJson } from "./codec.js";
import type { ActiveParticipantState } from "./types.js";

export class RedisParticipantStateStore {
  constructor(private readonly redis: Redis) {}

  async get(participantId: ParticipantId): Promise<ActiveParticipantState | null> {
    const raw = await this.redis.get(activeStateKeys.participant(participantId));
    return raw ? decodeActiveParticipant(raw) : null;
  }

  async put(state: ActiveParticipantState, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      activeStateKeys.participant(state.participantId),
      encodeJson(state),
      "EX",
      ttlSeconds,
    );
  }

  async remove(participantId: ParticipantId): Promise<void> {
    await this.redis.del(activeStateKeys.participant(participantId));
  }

  async listIds(roomId: RoomId): Promise<string[]> {
    return this.redis.smembers(activeStateKeys.participants(roomId));
  }

  async addToRoom(roomId: RoomId, participantId: ParticipantId): Promise<void> {
    await this.redis.sadd(activeStateKeys.participants(roomId), participantId);
  }

  async removeFromRoom(roomId: RoomId, participantId: ParticipantId): Promise<void> {
    await this.redis.srem(activeStateKeys.participants(roomId), participantId);
  }
}
