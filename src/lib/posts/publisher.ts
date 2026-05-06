/**
 * Publisher — WI-11
 *
 * Queries scheduled posts whose scheduled_for has passed and atomically
 * claims them for the posting worker.
 *
 * Concurrency strategy:
 *   claimReadyPosts() issues one claimForPosting() per candidate post.
 *   claimForPosting() does a conditional UPDATE (state=scheduled → posting).
 *   If two workers race, exactly one gets a row back; the other gets
 *   InvalidStateTransitionError, which is silently dropped here.
 *   No SELECT FOR UPDATE SKIP LOCKED is used — the conditional UPDATE alone
 *   is sufficient and simpler.
 *
 * WI-12 stub:
 *   publishPost() is intentionally unimplemented. WI-12 (LinkedIn API) will
 *   replace the NotImplementedError with real API calls.
 */

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import {
  claimForPosting,
  InvalidStateTransitionError,
  NotImplementedError,
  type Post,
} from "./state-machine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClaimReadyPostsOpts {
  /** Cutoff time — posts with scheduled_for ≤ now are eligible. Default: new Date() */
  now?: Date;
  /** Max posts to claim in one sweep. Default: 10 */
  limit?: number;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Find scheduled posts that are due and atomically claim them (scheduled → posting).
 *
 * Returns only successfully claimed posts. Posts that another worker already
 * claimed are silently dropped.
 */
export async function claimReadyPosts(
  opts: ClaimReadyPostsOpts = {},
): Promise<Post[]> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 10;

  const candidates = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.state, "scheduled"),
        lte(posts.scheduledFor, now),
      ),
    )
    .orderBy(asc(posts.scheduledFor))
    .limit(limit);

  const claimed: Post[] = [];

  for (const candidate of candidates) {
    try {
      const post = await claimForPosting(candidate.id);
      claimed.push(post);
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) {
        // Another worker claimed it first — skip silently.
        continue;
      }
      throw err;
    }
  }

  return claimed;
}

/**
 * Publish a single claimed post to LinkedIn.
 *
 * NOT IMPLEMENTED — WI-12 fills this in.
 * After claiming, the runner (WI-12) calls publishPost(post), which will:
 *   - Call the LinkedIn UGC Posts API
 *   - On success: markPosted(post.id, linkedinPostId)
 *   - On failure: markFailed(post.id, errorMessage)
 */
export async function publishPost(_post: Post): Promise<void> {
  throw new NotImplementedError(
    "publishPost() is not implemented yet. WI-12 (LinkedIn API) will provide this.",
  );
}
