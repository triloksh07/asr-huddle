import { Redis } from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export function createRedisClient(config: RedisConfig): Redis {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}
