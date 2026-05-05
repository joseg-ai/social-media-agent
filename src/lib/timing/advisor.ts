/**
 * Timing advisor — WI-08
 *
 * Decides WHEN to publish a LinkedIn post:
 *   - Reads posting window, daily caps, and gap constraints from the `settings` table
 *   - Applies cheap pre-flight arithmetic before touching the LLM
 *   - Falls through to the `timing_advisor` LLM prompt only for ambiguous cases
 *   - Returns a validated { action, schedule_for?, reason } decision
 *
 * Settings keys (read from DB, defaults documented below):
 *   posting_window_start_hour  — integer UTC hour, default 9  (09:00 UTC)
 *   posting_window_end_hour    — integer UTC hour, default 17 (17:00 UTC)
 *   max_posts_per_day          — integer, default 2
 *   min_gap_hours              — number, default 4
 *
 * Pre-flight order (each check short-circuits without an LLM call):
 *   1. daily cap reached          → skip
 *   2. last post within min gap   → schedule_for (last_post_at + min_gap_hours)
 *   3. outside posting window     → schedule_for (next window open)
 *   4. ambiguous (all clear)      → LLM decides
 *
 * Public API:
 *   getPostingContext(opts?)    → TimingContext
 *   applyPreflightChecks(ctx)  → TimingDecision | null  (null = call the LLM)
 *   decidePostingAction(opts?)  → TimingDecision
 */

import { and, count, desc, eq, gte, or } from "drizzle-orm";
import { z } from "zod";
import { db, posts, settings } from "@/db";
import { chat } from "@/lib/llm";
import { getActivePrompt, renderPrompt } from "@/lib/prompts";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  posting_window_start_hour: 9,  // 09:00 UTC
  posting_window_end_hour: 17,   // 17:00 UTC
  max_posts_per_day: 2,
  min_gap_hours: 4,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostingWindow {
  start_hour: number; // UTC hour (0–23)
  end_hour: number;   // UTC hour (0–23), exclusive
}

export interface TimingContext {
  posting_window: PostingWindow;
  max_posts_per_day: number;
  posts_today_count: number;
  /** Null if no post has been published yet. */
  last_post_at: Date | null;
  min_gap_hours: number;
  current_datetime: Date;
}

export type TimingAction = "post_now" | "schedule_for" | "skip";

export interface TimingDecision {
  action: TimingAction;
  /** ISO 8601 datetime — required when action is 'schedule_for'. */
  schedule_for?: string;
  reason: string;
}

// ── Zod schema for LLM output ─────────────────────────────────────────────────

const TimingDecisionLLMSchema = z
  .object({
    action: z.enum(["post_now", "schedule_for", "skip"]),
    schedule_for: z.string().optional(),
    reason: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "schedule_for") {
      if (!val.schedule_for) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "schedule_for is required when action is 'schedule_for'",
          path: ["schedule_for"],
        });
        return;
      }
      const dt = new Date(val.schedule_for);
      if (isNaN(dt.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `schedule_for is not a valid ISO 8601 datetime: ${val.schedule_for}`,
          path: ["schedule_for"],
        });
        return;
      }
      if (dt.getTime() <= Date.now()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `schedule_for must be in the future, got: ${val.schedule_for}`,
          path: ["schedule_for"],
        });
      }
    }
  });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read a numeric setting from the DB with a fallback default. */
async function readNumericSetting(
  key: string,
  defaultValue: number
): Promise<number> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  if (rows.length === 0) return defaultValue;
  const val = rows[0].value;
  if (typeof val === "number" && isFinite(val)) return val;
  return defaultValue;
}

/** UTC midnight for the given date (start of the UTC day). */
function utcDayStart(d: Date): Date {
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

// ── getPostingContext ─────────────────────────────────────────────────────────

/**
 * Pull all timing constraints from `settings` and recent `posts` data.
 *
 * @param opts.topic  Optional topic description forwarded to the LLM; not used
 *                    by this function but accepted for API symmetry.
 */
export async function getPostingContext(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts?: { topic?: string }
): Promise<TimingContext> {
  // ── Read settings (all run concurrently) ──────────────────────────────────
  const [startHour, endHour, maxPerDay, minGap] = await Promise.all([
    readNumericSetting(
      "posting_window_start_hour",
      DEFAULTS.posting_window_start_hour
    ),
    readNumericSetting(
      "posting_window_end_hour",
      DEFAULTS.posting_window_end_hour
    ),
    readNumericSetting("max_posts_per_day", DEFAULTS.max_posts_per_day),
    readNumericSetting("min_gap_hours", DEFAULTS.min_gap_hours),
  ]);

  const now = new Date();
  const todayStart = utcDayStart(now);

  // ── Count posts published or in-flight today ───────────────────────────────
  // 'posted': filter by posted_at; 'posting': filter by created_at (posted_at may be null).
  const [countRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(
      or(
        and(eq(posts.state, "posted"), gte(posts.postedAt, todayStart)),
        and(eq(posts.state, "posting"), gte(posts.createdAt, todayStart))
      )
    );

  const postsTodayCount = Number(countRow?.n ?? 0);

  // ── Most recent posted_at ─────────────────────────────────────────────────
  const lastRow = await db
    .select({ postedAt: posts.postedAt })
    .from(posts)
    .where(eq(posts.state, "posted"))
    .orderBy(desc(posts.postedAt))
    .limit(1);

  const lastPostAt = lastRow[0]?.postedAt ?? null;

  return {
    posting_window: { start_hour: startHour, end_hour: endHour },
    max_posts_per_day: maxPerDay,
    posts_today_count: postsTodayCount,
    last_post_at: lastPostAt,
    min_gap_hours: minGap,
    current_datetime: now,
  };
}

// ── applyPreflightChecks ──────────────────────────────────────────────────────

/**
 * Pure arithmetic pre-flight checks — no DB, no LLM.
 *
 * Returns a decision if a hard rule fires, or **null** when the case is
 * ambiguous and the LLM should decide.
 *
 * Exported so the smoke test (and future unit tests) can exercise each rule
 * independently with synthetic contexts.
 *
 * Check order matters:
 *   1. cap   — skip posting entirely today
 *   2. gap   — too soon after last post; defer by remaining gap time
 *   3. window — not yet / past today's window; defer to next window open
 */
export function applyPreflightChecks(ctx: TimingContext): TimingDecision | null {
  const now = ctx.current_datetime;

  // 1. Daily cap reached
  if (ctx.posts_today_count >= ctx.max_posts_per_day) {
    return {
      action: "skip",
      reason: `daily cap reached (${ctx.posts_today_count}/${ctx.max_posts_per_day} posts today)`,
    };
  }

  // 2. Minimum gap not yet elapsed
  if (ctx.last_post_at !== null) {
    const elapsedMs = now.getTime() - ctx.last_post_at.getTime();
    const gapMs = ctx.min_gap_hours * 60 * 60 * 1000;
    if (elapsedMs < gapMs) {
      const scheduleFor = new Date(ctx.last_post_at.getTime() + gapMs);
      return {
        action: "schedule_for",
        schedule_for: scheduleFor.toISOString(),
        reason: `min gap of ${ctx.min_gap_hours}h not met (${(elapsedMs / 3600000).toFixed(1)}h elapsed since last post)`,
      };
    }
  }

  // 3. Outside posting window (UTC hours, end_hour is exclusive)
  const currentHour = now.getUTCHours();
  const { start_hour, end_hour } = ctx.posting_window;

  if (currentHour < start_hour || currentHour >= end_hour) {
    let nextWindow: Date;
    if (currentHour < start_hour) {
      // Still today — window hasn't opened yet
      nextWindow = new Date(now);
      nextWindow.setUTCHours(start_hour, 0, 0, 0);
    } else {
      // Past today's window — open tomorrow
      nextWindow = new Date(now);
      nextWindow.setUTCDate(now.getUTCDate() + 1);
      nextWindow.setUTCHours(start_hour, 0, 0, 0);
    }
    return {
      action: "schedule_for",
      schedule_for: nextWindow.toISOString(),
      reason: `outside posting window (${start_hour}:00–${end_hour}:00 UTC, current UTC hour: ${currentHour})`,
    };
  }

  // All arithmetic checks pass — let the LLM decide
  return null;
}

// ── decidePostingAction ───────────────────────────────────────────────────────

/**
 * Determine the posting action for the current moment.
 *
 * 1. Build TimingContext from DB (settings + posts).
 * 2. Run cheap pre-flight checks — return immediately if a hard rule fires.
 * 3. Call the LLM for ambiguous cases; validate + return the parsed decision.
 *
 * Never throws — invalid LLM output falls back to { action: 'skip' }.
 *
 * @param opts.topic  Optional topic hint forwarded to the timing_advisor prompt.
 */
export async function decidePostingAction(opts?: {
  topic?: string;
}): Promise<TimingDecision> {
  const ctx = await getPostingContext(opts);

  // ── Pre-flight ─────────────────────────────────────────────────────────────
  const preflightDecision = applyPreflightChecks(ctx);
  if (preflightDecision !== null) {
    return preflightDecision;
  }

  // ── LLM path (ambiguous: within window, gap met, under cap) ───────────────
  try {
    const prompt = await getActivePrompt("timing_advisor", "timing");
    const masterContext = await readMasterContext();

    const postingWindowStr = `${ctx.posting_window.start_hour}:00–${ctx.posting_window.end_hour}:00 UTC`;
    const lastPostAtStr = ctx.last_post_at
      ? ctx.last_post_at.toISOString()
      : "never";

    const rendered = renderPrompt(prompt, {
      master_context: masterContext,
      current_datetime: ctx.current_datetime.toISOString(),
      posting_window: postingWindowStr,
      max_posts_per_day: String(ctx.max_posts_per_day),
      last_post_at: lastPostAtStr,
      min_gap_hours: String(ctx.min_gap_hours),
      post_topic: opts?.topic ?? "general Microsoft / Azure content",
    });

    const systemMessage = [
      "Respond with a valid JSON object only. No markdown, no prose.",
      'Schema: { "action": "post_now" | "schedule_for" | "skip", "schedule_for"?: "<ISO 8601 datetime>", "reason": "<string>" }',
      "Use action=post_now to post immediately, action=schedule_for with a future ISO 8601 datetime to defer,",
      "or action=skip to pass on this opportunity.",
      "The schedule_for field is required (and must be a future ISO 8601 datetime) when action is schedule_for.",
    ].join("\n");

    const result = await chat({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: rendered },
      ],
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      return {
        action: "skip",
        reason: `invalid LLM response (JSON parse failed): ${result.content.slice(0, 120)}`,
      };
    }

    const validation = TimingDecisionLLMSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        action: "skip",
        reason: `invalid LLM response (schema validation): ${validation.error.message}`,
      };
    }

    return validation.data as TimingDecision;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "skip",
      reason: `LLM call failed: ${message}`,
    };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Read the master_context setting; returns empty string if absent. */
async function readMasterContext(): Promise<string> {
  try {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "master_context"))
      .limit(1);
    if (rows.length > 0 && typeof rows[0].value === "string") {
      return rows[0].value;
    }
  } catch {
    // Non-fatal — timing still works without master context
  }
  return "";
}
