/**
 * Timing advisor — WI-08
 *
 * Decides WHEN to publish a LinkedIn post:
 *   - Reads posting window, daily caps, and gap constraints from the `settings` table
 *   - Applies cheap pre-flight arithmetic before touching the LLM
 *   - Falls through to the `timing_advisor` LLM prompt only for ambiguous cases
 *   - Returns a validated { action, schedule_for?, reason } decision
 *
 * Settings keys (read from DB, canonical shape defined in schema.ts):
 *   posting_windows      — JSONB { days: number[], startHour: number, endHour: number, tz: string }
 *                          days: JS weekday numbers 0(Sun)–6(Sat); empty array = every day allowed
 *                          startHour/endHour: UTC hours 0–23 (end exclusive); supports midnight wrap
 *                          tz: informational label — all comparisons are UTC
 *   max_posts_per_day    — number (default: 1)
 *   min_gap_hours        — number (default: 20)
 *   jitter_minutes       — number (default: 30) — random offset added to schedule_for outputs
 *
 * Pre-flight order (each check short-circuits without an LLM call):
 *   1. daily cap reached            → skip
 *   2. last post within min gap     → schedule_for (last_post_at + min_gap_hours + jitter)
 *   3. outside allowed weekdays     → schedule_for (next allowed day at window start + jitter)
 *   4. outside posting window       → schedule_for (next window open + jitter)
 *   5. ambiguous (all clear)        → LLM decides
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
  /** posting_windows mirrors the schema.ts JSONB shape. */
  posting_windows: {
    days: [1, 2, 3, 4, 5] as number[], // Mon–Fri (JS weekday: 0=Sun … 6=Sat)
    startHour: 9,
    endHour: 17,
    tz: "UTC",
  },
  max_posts_per_day: 1,
  min_gap_hours: 20,
  jitter_minutes: 30,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostingWindow {
  /** UTC hour when window opens (0–23). */
  start_hour: number;
  /**
   * UTC hour when window closes (exclusive, 0–23).
   * Midnight-wrapping is supported: when start_hour > end_hour the window
   * spans midnight (e.g., start=22 end=6 means 22:00–06:00 UTC).
   */
  end_hour: number;
  /**
   * JS weekday numbers that are allowed for posting (0=Sun … 6=Sat).
   * An empty array means every day is allowed.
   */
  days: number[];
  /** Timezone label (informational; all comparisons use UTC). */
  tz: string;
}

export interface TimingContext {
  posting_window: PostingWindow;
  max_posts_per_day: number;
  posts_today_count: number;
  /** Null if no post has been published yet. */
  last_post_at: Date | null;
  min_gap_hours: number;
  /** Random jitter in minutes applied to schedule_for outputs (0 = no jitter). */
  jitter_minutes: number;
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
  const num = Number(rows[0].value);
  return isFinite(num) ? num : defaultValue;
}

/** Shape of the `posting_windows` JSONB value stored in the settings table. */
interface PostingWindowsDB {
  days?: number[];
  startHour?: number;
  endHour?: number;
  tz?: string;
}

/** Read the `posting_windows` JSONB object from settings, falling back to defaults. */
async function readPostingWindows(): Promise<PostingWindow> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "posting_windows"))
    .limit(1);

  const v = rows[0]?.value as PostingWindowsDB | undefined;
  return {
    start_hour: v?.startHour ?? DEFAULTS.posting_windows.startHour,
    end_hour: v?.endHour ?? DEFAULTS.posting_windows.endHour,
    days: Array.isArray(v?.days) ? v.days : [...DEFAULTS.posting_windows.days],
    tz: v?.tz ?? DEFAULTS.posting_windows.tz,
  };
}

/**
 * Returns true if `hour` falls inside the posting window [start, end).
 * Handles midnight-wrapping when start > end (e.g., start=22 end=6).
 */
function isInsideWindow(hour: number, start: number, end: number): boolean {
  if (start <= end) {
    return hour >= start && hour < end;
  }
  // Midnight-wrapping: inside when hour >= start OR hour < end
  return hour >= start || hour < end;
}

/**
 * Add random jitter (0 … jitter_minutes) to a target Date and return ISO string.
 * Jitter of 0 returns an exact time (useful for deterministic tests).
 */
function withJitter(target: Date, jitterMinutes: number): string {
  const offsetMs = jitterMinutes > 0 ? Math.random() * jitterMinutes * 60_000 : 0;
  return new Date(target.getTime() + offsetMs).toISOString();
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
  const [postingWindow, maxPerDay, minGap, jitterMins] = await Promise.all([
    readPostingWindows(),
    readNumericSetting("max_posts_per_day", DEFAULTS.max_posts_per_day),
    readNumericSetting("min_gap_hours", DEFAULTS.min_gap_hours),
    readNumericSetting("jitter_minutes", DEFAULTS.jitter_minutes),
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
    posting_window: postingWindow,
    max_posts_per_day: maxPerDay,
    posts_today_count: postsTodayCount,
    last_post_at: lastPostAt,
    min_gap_hours: minGap,
    jitter_minutes: jitterMins,
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
      const target = new Date(ctx.last_post_at.getTime() + gapMs);
      return {
        action: "schedule_for",
        schedule_for: withJitter(target, ctx.jitter_minutes),
        reason: `min gap of ${ctx.min_gap_hours}h not met (${(elapsedMs / 3600000).toFixed(1)}h elapsed since last post)`,
      };
    }
  }

  const { start_hour, end_hour, days } = ctx.posting_window;

  // 3. Outside allowed weekdays (empty days array = every day allowed)
  const currentDay = now.getUTCDay(); // 0=Sun … 6=Sat
  if (days.length > 0 && !days.includes(currentDay)) {
    // Find the soonest allowed weekday
    let daysUntilNext = 1;
    while (daysUntilNext <= 7) {
      if (days.includes((currentDay + daysUntilNext) % 7)) break;
      daysUntilNext++;
    }
    const nextWindow = new Date(now);
    nextWindow.setUTCDate(now.getUTCDate() + daysUntilNext);
    nextWindow.setUTCHours(start_hour, 0, 0, 0);
    return {
      action: "schedule_for",
      schedule_for: withJitter(nextWindow, ctx.jitter_minutes),
      reason: `today (UTC weekday ${currentDay}) is not an allowed posting day`,
    };
  }

  // 4. Outside posting window (supports midnight-wrapping when start_hour > end_hour)
  const currentHour = now.getUTCHours();

  if (!isInsideWindow(currentHour, start_hour, end_hour)) {
    let nextWindow: Date;

    if (start_hour <= end_hour) {
      // Normal window (e.g., 09–17)
      if (currentHour < start_hour) {
        // Window hasn't opened yet today
        nextWindow = new Date(now);
        nextWindow.setUTCHours(start_hour, 0, 0, 0);
      } else {
        // Past today's window — open tomorrow
        nextWindow = new Date(now);
        nextWindow.setUTCDate(now.getUTCDate() + 1);
        nextWindow.setUTCHours(start_hour, 0, 0, 0);
      }
    } else {
      // Midnight-wrapping window (e.g., 22–06).
      // Outside = end_hour <= currentHour < start_hour (daytime gap).
      // Next open is today at start_hour.
      nextWindow = new Date(now);
      nextWindow.setUTCHours(start_hour, 0, 0, 0);
    }

    return {
      action: "schedule_for",
      schedule_for: withJitter(nextWindow, ctx.jitter_minutes),
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
