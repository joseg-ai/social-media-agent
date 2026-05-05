/**
 * Feed-poll job — ingests all active feed sources on a cron schedule.
 *
 * Schedule defaults to every 15 minutes; override via FEED_POLL_CRON env var.
 * Per-feed errors are caught and logged so a single broken feed never aborts
 * the rest of the run.
 */
import { defineJob } from "./runner";
import { listFeedSources } from "@/lib/feeds/sources";
import { ingestFeed } from "@/lib/feeds/ingest";

const JOB_NAME = "feed-poll";
const DEFAULT_SCHEDULE = "*/15 * * * *";

export function registerFeedPollJob(): void {
  const schedule = process.env.FEED_POLL_CRON ?? DEFAULT_SCHEDULE;

  defineJob(JOB_NAME, schedule, async () => {
    const sources = await listFeedSources({ includeInactive: false });

    let processedCount = 0;
    let totalInserted = 0;

    for (const source of sources) {
      try {
        const result = await ingestFeed(source.id);
        totalInserted += result.inserted;
        processedCount++;
      } catch (err) {
        console.error(
          `[job:${JOB_NAME}] error ingesting feed ${source.id} (${source.url}):`,
          err,
        );
      }
    }

    console.log(
      `[job:${JOB_NAME}] processed ${processedCount} feeds, ${totalInserted} articles inserted`,
    );
  });
}
