/**
 * Drizzle ORM client — postgres-js driver, connection pool, schema re-exports.
 *
 * Uses a module-level singleton to survive Next.js HMR reloads in development
 * without exhausting Postgres connection limits.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

function createClient() {
  const sql = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}

// In development, re-use a single instance across HMR reloads.
const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createClient> | undefined;
};

export const db = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type DB = typeof db;
export * from "./schema";
