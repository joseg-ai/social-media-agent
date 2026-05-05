/**
 * Background job definitions.
 * Jobs are registered via node-cron in instrumentation.ts (WI-06, WI-11).
 * Each job acquires a Postgres advisory lock before running (single-leader pattern).
 */
export {};
