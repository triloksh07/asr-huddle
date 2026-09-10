import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type AuthMode = "development" | "production";

export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly authMode: AuthMode;
}

export function loadConfig(): ApiConfig {
  const authMode = (process.env.AUTH_MODE ?? "development") as AuthMode;

  if (authMode !== "development" && authMode !== "production") {
    throw new Error(`Unsupported AUTH_MODE: ${authMode}`);
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    authMode,
  };
}
