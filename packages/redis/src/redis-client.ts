import Redis from "ioredis";

export interface RedisConfig {
  url: string;
  keyPrefix?: string;
}

export function createRedisClient(config: RedisConfig): Redis {
  return new Redis(config.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
}
