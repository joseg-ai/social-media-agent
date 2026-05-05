/**
 * Standalone job runner script.
 *
 * Usage: npx tsx scripts/run-jobs.ts
 *
 * Loads environment, registers all jobs, starts the cron schedules, and waits
 * indefinitely. SIGINT / SIGTERM triggers a graceful shutdown.
 */

// Ensure env vars are available (Next.js middleware won't load them here).
// Relies on DATABASE_URL etc. being set in the process environment or a .env
// file loaded externally (e.g. `dotenv-cli` or the shell).
import "@/lib/env"; // validates env vars and throws early if required vars are missing

import { register, startJobs, stopJobs } from "@/lib/jobs";

register();
startJobs();

console.log("[jobs] Job runner started. Waiting for scheduled runs. Press Ctrl+C to stop.");

function shutdown(signal: string) {
  console.log(`[jobs] Received ${signal} — shutting down gracefully...`);
  stopJobs();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
