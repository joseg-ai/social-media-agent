/**
 * Cron job runner with advisory-lock-based single-instance protection.
 *
 * Usage:
 *   defineJob("my-job", "* /5 * * * *", async () => { ... });
 *   startJobs();  // called once at boot
 *   stopJobs();   // called on SIGTERM / test teardown
 */
import cron, { type ScheduledTask } from "node-cron";
import { withAdvisoryLock, jobLockKey } from "./locks";

interface JobDefinition {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  task?: ScheduledTask;
}

const registry: JobDefinition[] = [];

/**
 * Register a named cron job.
 *
 * The handler is automatically wrapped with an advisory lock so that only one
 * instance across the cluster runs at a time. If the lock is already held,
 * the run is skipped with a console.log. Handler errors are caught and logged
 * so a single bad run never stops the schedule.
 */
export function defineJob(
  name: string,
  schedule: string,
  handler: () => Promise<void>,
): void {
  registry.push({ name, schedule, handler });
}

/** Start all registered cron schedules. Call once at application boot. */
export function startJobs(): void {
  for (const job of registry) {
    const lockKey = jobLockKey(job.name);

    job.task = cron.schedule(job.schedule, async () => {
      let result: void | null;

      try {
        result = await withAdvisoryLock(lockKey, async () => {
          try {
            await job.handler();
          } catch (err) {
            console.error(`[job:${job.name}] failed:`, err);
          }
        });
      } catch (err) {
        // Advisory lock infrastructure error (e.g. DB unreachable).
        console.error(`[job:${job.name}] lock error:`, err);
        return;
      }

      if (result === null) {
        console.log(`[job:${job.name}] skipped — another instance holds the lock`);
      }
    });

    console.log(`[jobs] registered "${job.name}" on schedule "${job.schedule}"`);
  }
}

/** Stop all running cron schedules. Safe to call multiple times. */
export function stopJobs(): void {
  for (const job of registry) {
    job.task?.stop();
  }
  console.log("[jobs] all jobs stopped");
}
