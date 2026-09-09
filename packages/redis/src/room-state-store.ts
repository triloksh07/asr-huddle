import type { Redis } from "ioredis";
import type { RoomId, RoomSessionId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";
import { decodeActiveRoom, encodeJson } from "./codec.js";
import type { ActiveRoomState } from "./types.js";

export class RedisRoomStateStore {
  constructor(private readonly redis: Redis) {}

  async get(roomId: RoomId): Promise<ActiveRoomState | null> {
    const raw = await this.redis.get(activeStateKeys.room(roomId));
    return raw ? decodeActiveRoom(raw) : null;
  }

  async put(state: ActiveRoomState, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      activeStateKeys.room(state.roomId),
      encodeJson(state),
      "EX",
      ttlSeconds,
    );
  }

  async markEnding(
    roomId: RoomId,
    roomSessionId: RoomSessionId,
    version: number,
  ): Promise<boolean> {
    const key = activeStateKeys.room(roomId);
    const raw = await this.redis.get(key);
    if (!raw) return false;

    const current = decodeActiveRoom(raw);
    if (current.roomSessionId !== roomSessionId || current.version !== version) {
      return false;
    }

    current.status = "ENDING";
    current.version += 1;
    const ttl = Math.max(
      1,
      Math.ceil((Date.parse(current.expiresAt) - Date.now()) / 1000),
    );

    await this.redis.set(key, encodeJson(current), "EX", ttl);
    return true;
  }

  async remove(roomId: RoomId): Promise<void> {
    await this.redis.del(activeStateKeys.room(roomId));
  }
}
