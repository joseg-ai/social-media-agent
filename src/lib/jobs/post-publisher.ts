/**
 * Post-publisher job — publishes scheduled LinkedIn posts on a cron schedule.
 *
 * Schedule defaults to every 1 minute; override via POST_PUBLISHER_CRON env var.
 * Per-post errors are caught so one failure never blocks others.
 *
 * Advisory lock: "post-publisher" key via jobLockKey() — see locks.ts.
 */
import { defineJob } from "./runner";
import { claimReadyPosts, publishPost } from "@/lib/posts/publisher";
import { LinkedInTransientError } from "@/lib/linkedin/poster";

const JOB_NAME = "post-publisher";
const DEFAULT_SCHEDULE = "*/1 * * * *";
const CLAIM_LIMIT = 5;

export interface PostPublisherResult {
  claimed: number;
  published: number;
  failedTransient: number;
  failedPermanent: number;
}

export function registerPostPublisherJob(): void {
  const schedule = process.env.POST_PUBLISHER_CRON ?? DEFAULT_SCHEDULE;

  defineJob(JOB_NAME, schedule, async () => {
    const claimed = await claimReadyPosts({ limit: CLAIM_LIMIT });

    const result: PostPublisherResult = {
      claimed: claimed.length,
      published: 0,
      failedTransient: 0,
      failedPermanent: 0,
    };

    for (const post of claimed) {
      try {
        await publishPost(post);
        result.published++;
      } catch (err) {
        if (err instanceof LinkedInTransientError) {
          result.failedTransient++;
          console.error(`[job:${JOB_NAME}] transient error on post ${post.id}:`, err);
        } else {
          result.failedPermanent++;
          console.error(`[job:${JOB_NAME}] permanent error on post ${post.id}:`, err);
        }
      }
    }

    console.log(
      `[job:${JOB_NAME}] claimed=${result.claimed} published=${result.published}` +
        ` failed_transient=${result.failedTransient} failed_permanent=${result.failedPermanent}`,
    );
  });
}
