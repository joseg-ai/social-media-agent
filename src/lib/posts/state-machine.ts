/**
 * Post state machine — WI-11
 *
 * Drives a post through:
 *   draft → scheduled → posting → posted
 *                               ↘ failed → scheduled (retry)
 *                                        ↘ cancelled
 *              ↘ cancelled (at any pre-terminal state)
 *
 * Concurrency strategy:
 *   Every transition uses a conditional UPDATE:
 *     UPDATE posts SET state = $toState, ... WHERE id = $id AND state = $fromState RETURNING *
 *
 *   If 0 rows are returned the row was already moved by another worker →
 *   throws InvalidStateTransitionError. No advisory locks needed; the
 *   conditional UPDATE is atomic inside Postgres.
 *
 *   claimForPosting() (scheduled → posting) relies solely on this mechanism.
 *   Two workers racing on the same post will each issue the UPDATE; exactly
 *   one will get a row back, the other gets 0 rows and is silently dropped
 *   by claimReadyPosts() in publisher.ts.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Post = typeof posts.$inferSelect;
export type PostState = Post["state"];

// ── Errors ────────────────────────────────────────────────────────────────────

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly postId: string,
    public readonly fromState: PostState,
    public readonly toState: PostState,
  ) {
    super(
      `Cannot transition post ${postId} from "${fromState}" to "${toState}": ` +
        `either the transition is not allowed or another worker already moved it.`,
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class PostNotFoundError extends Error {
  constructor(public readonly postId: string) {
    super(`Post not found: ${postId}`);
    this.name = "PostNotFoundError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

// ── Allowed transitions ───────────────────────────────────────────────────────

/**
 * Whitelist of valid (fromState, toState) pairs.
 * Any transition not listed here throws immediately — no DB round-trip.
 */
const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  "draft→scheduled",     // approve: schedule the post
  "draft→cancelled",     // reject: don't post at all
  "scheduled→posting",   // publisher claims it
  "scheduled→cancelled", // un-schedule before posting
  "scheduled→draft",     // edit; back to review queue
  "posting→posted",      // success
  "posting→failed",      // LinkedIn API error
  "failed→scheduled",    // retry: put back in queue
  "failed→cancelled",    // give up after repeated failures
]);

function transitionKey(from: PostState, to: PostState): string {
  return `${from}→${to}`;
}

// ── Core transition ───────────────────────────────────────────────────────────

export interface TransitionOpts {
  /** ISO 8601 or Date — sets scheduled_for during approve / retry. */
  scheduledFor?: Date | string;
  postedAt?: Date;
  linkedinPostId?: string;
  failureReason?: string;
  /** When provided, increments failure_count rather than resetting it. */
  incrementFailureCount?: boolean;
  cancelReason?: string;
}

/**
 * Atomic state transition with optimistic concurrency.
 *
 * Issues a single conditional UPDATE and returns the updated row.
 * Throws InvalidStateTransitionError when:
 *   - the (fromState, toState) pair is not in ALLOWED_TRANSITIONS, or
 *   - 0 rows were updated (another worker already moved the post).
 */
export async function transitionPost(
  postId: string,
  fromState: PostState,
  toState: PostState,
  opts: TransitionOpts = {},
): Promise<Post> {
  const key = transitionKey(fromState, toState);
  if (!ALLOWED_TRANSITIONS.has(key)) {
    throw new InvalidStateTransitionError(postId, fromState, toState);
  }

  // Build the SET clause. Drizzle accepts sql`` expressions for computed fields.
  type PostUpdate = Parameters<
    ReturnType<typeof db.update<typeof posts>>["set"]
  >[0];

  const setValues: PostUpdate = { state: toState, updatedAt: new Date() };

  if (opts.scheduledFor !== undefined) {
    setValues.scheduledFor =
      typeof opts.scheduledFor === "string"
        ? new Date(opts.scheduledFor)
        : opts.scheduledFor;
  }
  if (opts.postedAt !== undefined) {
    setValues.postedAt = opts.postedAt;
  }
  if (opts.linkedinPostId !== undefined) {
    setValues.linkedinPostId = opts.linkedinPostId;
  }
  if (opts.failureReason !== undefined) {
    setValues.failureReason = opts.failureReason;
  }
  if (opts.cancelReason !== undefined) {
    setValues.cancelReason = opts.cancelReason;
  }
  if (opts.incrementFailureCount) {
    setValues.failureCount = sql`${posts.failureCount} + 1`;
  }

  const rows = await db
    .update(posts)
    .set(setValues)
    .where(and(eq(posts.id, postId), eq(posts.state, fromState)))
    .returning();

  if (rows.length === 0) {
    throw new InvalidStateTransitionError(postId, fromState, toState);
  }

  return rows[0]!;
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * draft → scheduled.
 * Optionally sets scheduled_for; if omitted, scheduledFor remains null
 * (caller must set it before the publisher tries to claim the post).
 */
export async function approveDraft(
  postId: string,
  opts: { schedule_for?: Date | string } = {},
): Promise<Post> {
  return transitionPost(postId, "draft", "scheduled", {
    scheduledFor: opts.schedule_for,
  });
}

/**
 * any non-terminal state → cancelled.
 * Tries the most likely current state first, then falls through.
 * If the post is already in a terminal state (posted/cancelled) throws.
 */
export async function cancelPost(
  postId: string,
  reason?: string,
): Promise<Post> {
  // Fetch current state to pick the right from-state.
  const current = await db
    .select({ state: posts.state })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (current.length === 0) {
    throw new PostNotFoundError(postId);
  }

  const fromState = current[0]!.state;

  return transitionPost(postId, fromState, "cancelled", {
    cancelReason: reason,
  });
}

/**
 * scheduled → posting.
 * The publisher calls this to atomically claim a scheduled post.
 * Exactly one concurrent worker wins; others throw InvalidStateTransitionError.
 */
export async function claimForPosting(postId: string): Promise<Post> {
  return transitionPost(postId, "scheduled", "posting");
}

/**
 * posting → posted.
 * Records the LinkedIn post URN and the posted timestamp.
 */
export async function markPosted(
  postId: string,
  linkedinPostId: string,
): Promise<Post> {
  return transitionPost(postId, "posting", "posted", {
    linkedinPostId,
    postedAt: new Date(),
  });
}

/**
 * posting → failed.
 * Records the error message and increments failure_count.
 */
export async function markFailed(
  postId: string,
  error: string,
): Promise<Post> {
  return transitionPost(postId, "posting", "failed", {
    failureReason: error,
    incrementFailureCount: true,
  });
}

/**
 * failed → scheduled.
 * Puts the post back in the queue for another attempt.
 */
export async function retryFailed(
  postId: string,
  opts: { schedule_for?: Date | string } = {},
): Promise<Post> {
  return transitionPost(postId, "failed", "scheduled", {
    scheduledFor: opts.schedule_for,
  });
}
