/**
 * Production startup script — boots the Next.js web server AND the cron job
 * runner in a single process.
 *
 * Usage (via package.json):
 *   npm run start:prod
 *
 * Why single-process? App Service supports one startup command. Running both
 * here shares the same DB connection pool, avoids WebJob overhead, and keeps
 * the scaling story simple (scale-out = more App Service instances, advisory
 * locks prevent duplicate job runs).
 *
 * Graceful shutdown:
 *   SIGTERM / SIGINT  →  stop cron jobs, kill Next.js child, drain DB pool.
 */

import "@/lib/env"; // validate env vars early; throws with a clear message if any are missing

import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { register, startJobs, stopJobs } from "@/lib/jobs";

const log = (msg: string) => console.log(`[start-prod] ${msg}`);
const err = (msg: string) => console.error(`[start-prod] ${msg}`);

// ── 1. Register and start cron jobs ──────────────────────────────────────────

register();
startJobs();
log("Cron jobs registered and started.");

// ── 2. Spawn Next.js server ───────────────────────────────────────────────────

const port = process.env.PORT ?? "3000";
const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");

const nextProcess: ChildProcess = spawn(
  process.execPath, // node
  [nextBin, "start", "--port", port],
  {
    stdio: "inherit",
    env: { ...process.env },
  },
);

log(`Next.js server started on port ${port} (pid ${nextProcess.pid}).`);

nextProcess.on("error", (spawnErr) => {
  err(`Next.js process error: ${spawnErr.message}`);
  process.exit(1);
});

nextProcess.on("exit", (code, signal) => {
  if (signal) {
    log(`Next.js process killed by signal ${signal}.`);
  } else {
    err(`Next.js process exited unexpectedly with code ${code ?? "null"}.`);
    process.exit(code ?? 1);
  }
});

// ── 3. Graceful shutdown ──────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`Received ${signal} — shutting down gracefully...`);

  // Stop cron schedules first so no new jobs are triggered.
  stopJobs();

  // Ask Next.js to stop; give it up to 10 s before forcing.
  const forceKillTimer = setTimeout(() => {
    err("Next.js did not exit in time — sending SIGKILL.");
    nextProcess.kill("SIGKILL");
  }, 10_000);

  nextProcess.once("exit", () => {
    clearTimeout(forceKillTimer);
    log("Next.js process exited. Shutdown complete.");
    // postgres-js connections are released when the process exits; the pool
    // does not expose a standalone `.end()` on the drizzle wrapper, so we
    // rely on process exit to drain connections.
    process.exit(0);
  });

  nextProcess.kill("SIGTERM");
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
