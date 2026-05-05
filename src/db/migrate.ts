/**
 * Database migration runner — executes all pending Drizzle migrations.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx src/db/migrate.ts
 *   (or via npm script: npm run db:migrate)
 *
 * Uses a single dedicated connection (not the app pool) so it can be run
 * standalone in CI and during deployment without touching the app server.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  // Single connection — migrations are not parallelisable.
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

  console.log("▶  Running Drizzle migrations from:", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("✔  Migrations complete.");

  await client.end();
}

runMigrations().catch((err) => {
  console.error("✘  Migration failed:", err);
  process.exit(1);
});
