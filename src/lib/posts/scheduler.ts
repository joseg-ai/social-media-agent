/**
 * Post scheduler — WI-11
 *
 * Bridges the timing advisor (WI-08) and the post state machine.
 * Reads the advisor's action and calls approveDraft() with the right schedule_for.
 *
 * Public API:
 *   scheduleDraft(postId)                  — schedule a single draft post
 *   scheduleAllDrafts({ limit? })          — batch helper; per-post try/catch
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { decidePostingAction } from "@/lib/timing/advisor";
import { approveDraft } from "./state-machine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduleDraftResult {
  postId: string;
  scheduled: boolean;
  scheduledFor?: Date;
  /** Populated when scheduled=false (action was 'skip'). */
  reason?: string;
}

export interface ScheduleAllDraftsResult {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: Array<{ postId: string; error: string }>;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Run the timing advisor for `postId` and transition it from draft → scheduled.
 *
 * - action=post_now   → scheduledFor = now
 * - action=schedule_for → scheduledFor = decision.schedule_for (ISO)
 * - action=skip       → post stays draft; returns { scheduled: false, reason }
 */
export async function scheduleDraft(
  postId: string,
): Promise<ScheduleDraftResult> {
  const decision = await decidePostingAction();

  if (decision.action === "skip") {
    return { postId, scheduled: false, reason: decision.reason };
  }

  const scheduledFor =
    decision.action === "schedule_for" && decision.schedule_for
      ? new Date(decision.schedule_for)
      : new Date();

  await approveDraft(postId, { schedule_for: scheduledFor });

  return { postId, scheduled: true, scheduledFor };
}

/**
 * Schedule all draft posts up to `limit`.
 * Each post is processed independently — one failure does not abort the rest.
 */
export async function scheduleAllDrafts(
  opts: { limit?: number } = {},
): Promise<ScheduleAllDraftsResult> {
  const limit = opts.limit ?? 50;

  const draftPosts = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.state, "draft"))
    .limit(limit);

  const result: ScheduleAllDraftsResult = {
    total: draftPosts.length,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const { id } of draftPosts) {
    try {
      const outcome = await scheduleDraft(id);
      if (outcome.scheduled) {
        result.succeeded++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        postId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
