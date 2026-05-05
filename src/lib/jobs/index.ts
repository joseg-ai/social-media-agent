/**
 * Public API surface for the job runner.
 *
 * `register()` wires up all known jobs. Future jobs (post-publisher, etc.)
 * plug in here — one import, one call.
 */
export { defineJob, startJobs, stopJobs } from "./runner";
export { withAdvisoryLock, jobLockKey } from "./locks";
export { registerFeedPollJob } from "./feed-poll";

import { registerFeedPollJob } from "./feed-poll";

/** Register all jobs. Call once before `startJobs()`. */
export function register(): void {
  registerFeedPollJob();
  // Future: registerPostPublisherJob(); etc.
}
