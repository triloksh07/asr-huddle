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

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export type AuthMode = 'development' | 'production';

export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly mediaBaseUrl: string;
  readonly authMode: AuthMode;
  readonly participantDisconnectRecoveryMs: number;
  readonly roomLifecycleIntervalMs: number;
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
  };
}
