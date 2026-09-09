import type { Redis } from "ioredis";
import type { RoomId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";

export class RedisRoomExpiryStore {
  constructor(private readonly redis: Redis) {}

  async schedule(roomId: RoomId, expiresAt: Date): Promise<void> {
    await this.redis.zadd(
      activeStateKeys.roomExpiry(roomId),
      expiresAt.getTime(),
      roomId,
    );
  }

  async remove(roomId: RoomId): Promise<void> {
    await this.redis.del(activeStateKeys.roomExpiry(roomId));
  }
}
