/**
 * Publisher — WI-11 / WI-12
 *
 * Queries scheduled posts whose scheduled_for has passed and atomically
 * claims them for the posting worker.
 *
 * Known limitation (WI-12):
 *   Orphan post risk — if postToLinkedIn() succeeds but markPosted() fails
 *   (e.g., DB connection drops), the post exists on LinkedIn with no DB record.
 *   The linkedinPostId is logged to stderr loudly for manual reconciliation.
 */

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import {
  claimForPosting,
  InvalidStateTransitionError,
  markFailed,
  markPosted,
  type Post,
} from "./state-machine";
import {
  postToLinkedIn,
  LinkedInAuthError,
  LinkedInTransientError,
} from "@/lib/linkedin/poster";
import { getValidAccessToken } from "@/lib/linkedin/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClaimReadyPostsOpts {
  /** Cutoff time — posts with scheduled_for <= now are eligible. Default: new Date() */
  now?: Date;
  /** Max posts to claim in one sweep. Default: 10 */
  limit?: number;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Find scheduled posts that are due and atomically claim them (scheduled -> posting).
 * Returns only successfully claimed posts.
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
 * Expects post to be in "posting" state (already claimed by claimReadyPosts).
 * On success:    transitions posting -> posted, stores linkedinPostId.
 * On auth error: transitions posting -> failed, re-throws.
 * On transient:  transitions posting -> failed, re-throws.
 * On permanent:  transitions posting -> failed, re-throws.
 */
export async function publishPost(post: Post): Promise<Post> {
  const accessToken = await getValidAccessToken();
  let linkedinPostId: string | undefined;

  try {
    ({ linkedinPostId } = await postToLinkedIn(post, accessToken));
  } catch (err) {
    if (err instanceof LinkedInTransientError) {
      await markFailed(post.id, err.message);
      throw err;
    }
    if (err instanceof LinkedInAuthError) {
      await markFailed(post.id, "linkedin_auth_failed");
      throw err;
    }
    await markFailed(
      post.id,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }

  try {
    return await markPosted(post.id, linkedinPostId);
  } catch (dbErr) {
    // CRITICAL: post exists on LinkedIn but DB update failed.
    console.error(
      `[publisher] ORPHAN POST — LinkedIn post created but DB update failed!` +
        ` post.id=${post.id} linkedinPostId=${linkedinPostId}`,
      dbErr,
    );
    throw dbErr;
  }
}
