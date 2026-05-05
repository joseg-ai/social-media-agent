# Skill: Drizzle Migration Runner for Next.js 15 + postgres-js

**Slug:** `drizzle-migration-runner`  
**Author:** Tank  
**Extracted:** 2026-05-05  
**Applies to:** Next.js 15 (App Router) + Drizzle ORM + postgres-js driver

---

## Problem

Drizzle ORM generates plain SQL migration files via `drizzle-kit generate`. You need a way to run those migrations:
- In CI/CD pipelines (before deploy)
- Locally against Docker Compose Postgres
- Without Prisma, a separate migration service, or complex setup
- Without requiring all application env vars (LinkedIn keys, Azure keys, etc.)

`drizzle-kit migrate` requires the full drizzle-kit dev dependency at runtime, which is heavy. The built-in `drizzle-orm/postgres-js/migrator` is the right production-grade approach.

---

## Pattern

### 1. Migration runner script (`src/db/migrate.ts`)

```typescript
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is required.");

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
```

**Key design points:**
- `max: 1` — migrations must run sequentially, one connection is correct
- `client.end()` — explicit teardown so the process exits cleanly
- `process.exit(1)` on failure — CI fails the pipeline correctly
- Reads `DATABASE_URL` directly from `process.env`, not from the validated `env.ts` — avoids requiring all application env vars for a migration-only run

### 2. npm scripts (`package.json`)

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate":  "tsx src/db/migrate.ts",
    "db:studio":   "drizzle-kit studio"
  }
}
```

### 3. TypeScript runner (`tsx` dev dep)

```bash
npm install --save-dev tsx
```

`tsx` is a fast TypeScript executor (wraps esbuild). Chosen over `ts-node` because:
- No need to configure `tsconfig` paths for CJS/ESM interop
- Works with Next.js 15 project `moduleResolution: "bundler"` without hacks
- Zero config — just `tsx <file.ts>`

### 4. App client singleton (`src/db/index.ts`)

```typescript
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";    // validated env — throws if misconfigured
import * as schema from "./schema";

function createClient() {
  const sql = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}

// Dev HMR singleton — prevents connection pool exhaustion on hot reloads
const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createClient> | undefined;
};

export const db = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type DB = typeof db;
export * from "./schema";
```

---

## Usage

```bash
# Generate SQL from schema changes
npm run db:generate

# Apply migrations to local Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mydb npm run db:migrate

# Or with env file:
# (set DATABASE_URL in .env.local) then:
npm run db:migrate

# Start Docker Compose Postgres first:
docker compose up -d postgres
npm run db:migrate
```

---

## Drizzle config (`drizzle.config.ts`)

```typescript
import type { Config } from "drizzle-kit";

const config: Config = {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
};

export default config;
```

---

## Gotchas

1. **`path.join(process.cwd(), "src", "db", "migrations")`** — use `process.cwd()` not `__dirname`. In Next.js 15 (ESM modules), `__dirname` is undefined. `cwd()` returns the project root when run from the repo root via npm scripts.

2. **`client.end()` is required** — without it, the migration script process hangs because the postgres-js pool keeps the event loop alive.

3. **Don't import validated env in migrate.ts** — the validated `env.ts` requires ALL application env vars (LinkedIn, Azure, etc.). The migration runner only needs `DATABASE_URL`. Import directly from `process.env` in `migrate.ts`.

4. **Drizzle records applied migrations in `__drizzle_migrations` table** — this table is auto-created by the migrator. Don't delete it — it tracks which SQL files have already been applied.

5. **Each SQL file runs in a transaction** — if a migration fails mid-way, Postgres rolls back that migration. The `__drizzle_migrations` table won't record it as applied. Safe to re-run after fixing the SQL.
