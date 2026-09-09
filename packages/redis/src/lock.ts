import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { activeStateKeys } from "./keys.js";

const releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export interface LockHandle {
  key: string;
  token: string;
  release(): Promise<void>;
}

export class RedisDistributedLock {
  constructor(private readonly redis: Redis) {}

  async acquire(name: string, ttlMs: number): Promise<LockHandle | null> {
    const key = activeStateKeys.lock(name);
    const token = randomUUID();
    const result = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (result !== "OK") return null;

    return {
      key,
      token,
      release: async () => {
        await this.redis.eval(releaseScript, 1, key, token);
      },
    };
  }
}
