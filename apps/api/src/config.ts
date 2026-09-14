import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredSecret(name: string): string {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters.`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function requiredPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  const parsed = positiveInteger(value, fallback, name);
  if (parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export type AuthMode = 'development' | 'production';

export interface RateLimitConfig {
  readonly authRegisterLimit: number;
  readonly authRegisterWindowMs: number;
  readonly authLoginLimit: number;
  readonly authLoginWindowMs: number;
  readonly connectionLimit: number;
  readonly connectionWindowMs: number;
  readonly commandLimit: number;
  readonly commandWindowMs: number;
  readonly sessionLimit: number;
  readonly sessionWindowMs: number;
  readonly roomCreateLimit: number;
  readonly roomCreateWindowMs: number;
  readonly speakerRequestLimit: number;
  readonly speakerRequestWindowMs: number;
  readonly reactionBurstLimit: number;
  readonly reactionBurstWindowMs: number;
  readonly reactionSameTypeWindowMs: number;
  readonly mediaLimit: number;
  readonly mediaWindowMs: number;
  readonly maxViolations: number;
  readonly violationWindowMs: number;
}

export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly mediaBaseUrl: string;
  readonly authMode: AuthMode;
  readonly participantDisconnectRecoveryMs: number;
  readonly roomLifecycleIntervalMs: number;
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtTtlSeconds: number;
  readonly realtimeMaxMessageBytes: number;
  readonly realtimeMaxProtocolViolations: number;
  readonly rateLimits: RateLimitConfig;
}

export function loadConfig(): ApiConfig {
  const authMode = (process.env.AUTH_MODE ?? 'development') as AuthMode;

  if (authMode !== 'development' && authMode !== 'production') {
    throw new Error(`Unsupported AUTH_MODE: ${authMode}`);
  }

  return {
    port: positiveInteger(process.env.API_PORT ?? process.env.PORT, 3000, 'API_PORT'),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    mediaBaseUrl: process.env.SFU_MEDIA_BASE_URL ?? 'http://127.0.0.1:4000',
    authMode,
    participantDisconnectRecoveryMs: positiveInteger(
      process.env.PARTICIPANT_DISCONNECT_RECOVERY_MS,
      30_000,
      'PARTICIPANT_DISCONNECT_RECOVERY_MS'
    ),
    roomLifecycleIntervalMs: positiveInteger(
      process.env.ROOM_LIFECYCLE_INTERVAL_MS,
      30_000,
      'ROOM_LIFECYCLE_INTERVAL_MS'
    ),
    jwtSecret: requiredSecret('JWT_SECRET'),
    jwtIssuer: process.env.JWT_ISSUER ?? 'asr-huddle-api',
    jwtTtlSeconds: positiveInteger(process.env.JWT_TTL_SECONDS, 3600, 'JWT_TTL_SECONDS'),
    realtimeMaxMessageBytes: positiveInteger(
      process.env.REALTIME_MAX_MESSAGE_BYTES,
      65_536,
      'REALTIME_MAX_MESSAGE_BYTES'
    ),
    realtimeMaxProtocolViolations: positiveInteger(
      process.env.REALTIME_MAX_PROTOCOL_VIOLATIONS,
      5,
      'REALTIME_MAX_PROTOCOL_VIOLATIONS'
    ),
    rateLimits: {
      authRegisterLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_AUTH_REGISTER_LIMIT,
        5,
        'RATE_LIMIT_AUTH_REGISTER_LIMIT'
      ),
      authRegisterWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_AUTH_REGISTER_WINDOW_MS,
        60 * 60_000,
        'RATE_LIMIT_AUTH_REGISTER_WINDOW_MS'
      ),
      authLoginLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_AUTH_LOGIN_LIMIT,
        10,
        'RATE_LIMIT_AUTH_LOGIN_LIMIT'
      ),
      authLoginWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_AUTH_LOGIN_WINDOW_MS,
        60_000,
        'RATE_LIMIT_AUTH_LOGIN_WINDOW_MS'
      ),
      connectionLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_CONNECTION_LIMIT,
        10,
        'RATE_LIMIT_CONNECTION_LIMIT'
      ),
      connectionWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_CONNECTION_WINDOW_MS,
        60_000,
        'RATE_LIMIT_CONNECTION_WINDOW_MS'
      ),
      commandLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_COMMAND_LIMIT,
        100,
        'RATE_LIMIT_COMMAND_LIMIT'
      ),
      commandWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_COMMAND_WINDOW_MS,
        10_000,
        'RATE_LIMIT_COMMAND_WINDOW_MS'
      ),
      sessionLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_SESSION_LIMIT,
        10,
        'RATE_LIMIT_SESSION_LIMIT'
      ),
      sessionWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_SESSION_WINDOW_MS,
        60_000,
        'RATE_LIMIT_SESSION_WINDOW_MS'
      ),
      roomCreateLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_ROOM_CREATE_LIMIT,
        5,
        'RATE_LIMIT_ROOM_CREATE_LIMIT'
      ),
      roomCreateWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_ROOM_CREATE_WINDOW_MS,
        60 * 60_000,
        'RATE_LIMIT_ROOM_CREATE_WINDOW_MS'
      ),
      speakerRequestLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_SPEAKER_REQUEST_LIMIT,
        5,
        'RATE_LIMIT_SPEAKER_REQUEST_LIMIT'
      ),
      speakerRequestWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_SPEAKER_REQUEST_WINDOW_MS,
        30_000,
        'RATE_LIMIT_SPEAKER_REQUEST_WINDOW_MS'
      ),
      reactionBurstLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_REACTION_BURST_LIMIT,
        5,
        'RATE_LIMIT_REACTION_BURST_LIMIT'
      ),
      reactionBurstWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_REACTION_BURST_WINDOW_MS,
        1_000,
        'RATE_LIMIT_REACTION_BURST_WINDOW_MS'
      ),
      reactionSameTypeWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_REACTION_SAME_TYPE_WINDOW_MS,
        4_000,
        'RATE_LIMIT_REACTION_SAME_TYPE_WINDOW_MS'
      ),
      mediaLimit: requiredPositiveInteger(
        process.env.RATE_LIMIT_MEDIA_LIMIT,
        60,
        'RATE_LIMIT_MEDIA_LIMIT'
      ),
      mediaWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_MEDIA_WINDOW_MS,
        10_000,
        'RATE_LIMIT_MEDIA_WINDOW_MS'
      ),
      maxViolations: requiredPositiveInteger(
        process.env.RATE_LIMIT_MAX_VIOLATIONS,
        3,
        'RATE_LIMIT_MAX_VIOLATIONS'
      ),
      violationWindowMs: requiredPositiveInteger(
        process.env.RATE_LIMIT_VIOLATION_WINDOW_MS,
        10_000,
        'RATE_LIMIT_VIOLATION_WINDOW_MS'
      ),
    },
  };
}
