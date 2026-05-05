/**
 * Database layer — Drizzle ORM client and schema re-exports.
 *
 * WI-19 note: schema.ts on this branch is a partial soft-import (oauth_tokens
 * only). After PR #6 (WI-02) merges, schema.ts will be replaced with the full
 * 7-table schema and this client will continue to work unchanged.
 *
 * HMR singleton pattern: cache the db instance on globalThis to prevent
 * connection pool exhaustion across Next.js hot-module reloads in dev.
 *
 * Lazy initialization: the postgres pool does not actually connect until the
 * first query, so module import is safe even without DATABASE_URL at build time.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __db: DrizzleDb | undefined;
}

function createDb(): DrizzleDb {
  // Postgres is lazy — the pool connects on the first query, not at construction.
  // This allows the module to be imported safely at build time without DATABASE_URL.
  const client = postgres(process.env.DATABASE_URL ?? "", { max: 10 });
  return drizzle(client, { schema });
}

export const db = globalThis.__db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__db = db;
}

export * from "./schema";