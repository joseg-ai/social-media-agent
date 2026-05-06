/**
 * Production migration runner.
 *
 * Runs all pending Drizzle migrations from src/db/migrations/ against the
 * target database. Designed to be executed as a one-off pre-deploy step:
 *
 *   DATABASE_URL=<url> npm run db:migrate:prod
 *
 * Exit codes:
 *   0  — all migrations applied (or already up-to-date)
 *   1  — missing DATABASE_URL or migration failure
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "✘  DATABASE_URL is not set.\n" +
        "   Set it in your environment or .env file before running migrations.",
    );
    process.exit(1);
  }

  console.log("▶  Connecting to database...");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
  console.log(`▶  Running Drizzle migrations from: ${migrationsFolder}`);

  await migrate(db, { migrationsFolder });

  console.log("✔  Migrations complete.");
  await client.end();
}

runMigrations().catch((e) => {
  console.error("✘  Migration failed:", e);
  process.exit(1);
});
