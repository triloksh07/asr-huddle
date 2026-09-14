import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
local limit = tonumber(ARGV[2])
local allowed = current <= limit and 1 or 0
local remaining = limit - current
if remaining < 0 then
  remaining = 0
end
return { allowed, remaining, ttl }
`;

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}
export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterMs: number;
}
export class RateLimitInfrastructureError extends Error {
  constructor() {
    super('Rate limiting service is unavailable.');
    this.name = 'RateLimitInfrastructureError';
  }
}
function validateRule(rule: RateLimitRule): void {
  if (!Number.isInteger(rule.limit) || rule.limit < 1)
    throw new Error('Rate-limit limit must be a positive integer.');
  if (!Number.isInteger(rule.windowMs) || rule.windowMs < 1)
    throw new Error('Rate-limit window must be a positive integer.');
}
function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex');
}
function parseRedisResult(result: unknown): [number, number, number] {
  if (
    !Array.isArray(result) ||
    result.length !== 3 ||
    !result.every(value => typeof value === 'number' && Number.isFinite(value))
  )
    throw new Error('Redis returned an invalid rate-limit result.');
  return [result[0], result[1], result[2]];
}
export interface RateLimiter {
  consume(scope: string, identifier: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = 'asr:v1:rate-limit',
    private readonly metrics?: RuntimeMetrics,
    private readonly logger?: StructuredLogger
  ) {}

  async consume(
    scope: string,
    identifier: string,
    rule: RateLimitRule
  ): Promise<RateLimitDecision> {
    validateRule(rule);
    const startedAt = performance.now();
    const key = `${this.keyPrefix}:${scope}:${hashIdentifier(identifier)}`;
    try {
      const result = await this.redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(rule.windowMs),
        String(rule.limit)
      );
      const [allowed, remaining, retryAfterMs] = parseRedisResult(result);
      const durationMs = performance.now() - startedAt;
      this.metrics?.recordDependency('redis', 'rate_limit', true, durationMs);
      return {
        allowed: allowed === 1,
        limit: rule.limit,
        remaining,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.metrics?.recordDependency('redis', 'rate_limit', false, durationMs);
      this.logger?.error('dependency_operation_failed', {
        dependency: 'redis',
        operation: 'rate_limit',
        scope,
        durationMs: Math.round(durationMs * 100) / 100,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw new RateLimitInfrastructureError();
    }
  }
}
