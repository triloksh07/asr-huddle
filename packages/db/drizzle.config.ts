import { defineConfig } from 'drizzle-kit';

// TODO: need to review it before production, fine for development testing
const databaseUrl =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.DATABASE_URL ?? '';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // url: process.env.DATABASE_URL ?? "",
    url: databaseUrl ?? '',
  },
  strict: true,
  verbose: true,
});
