/**
 * Public API surface for the job runner.
 *
 * `register()` wires up all known jobs. Future jobs plug in here —
 * one import, one call.
 */
export { defineJob, startJobs, stopJobs } from "./runner";
export { withAdvisoryLock, jobLockKey } from "./locks";
export { registerFeedPollJob } from "./feed-poll";
export { registerPostPublisherJob } from "./post-publisher";

import { registerFeedPollJob } from "./feed-poll";
import { registerPostPublisherJob } from "./post-publisher";

/** Register all jobs. Call once before startJobs(). */
export function register(): void {
  registerFeedPollJob();
  registerPostPublisherJob();
}
