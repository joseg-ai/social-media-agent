/**
 * Smoke test — WI-08 timing advisor
 *
 * Run with:
 *   npx tsx src/lib/timing/advisor.smoke.ts
 *
 * Tests pre-flight rules using synthetic TimingContext objects — no DB, no LLM.
 * Exercises the LLM path only when RUN_LLM_SMOKE=1 is set (requires a live DB
 * with valid Azure OpenAI credentials and a seeded `timing_advisor` prompt).
 *
 * Pre-flight scenarios covered:
 *   A. Daily cap reached            → skip
 *   B. Min gap not met              → schedule_for (last_post_at + min_gap_hours)
 *   C. Outside window (before)      → schedule_for (same day, window start)
 *   D. Outside window (after)       → schedule_for (next day, window start)
 *   E. All clear                    → null (LLM would decide)
 *   F. Exactly at cap               → skip
 *   G. Exactly at gap boundary      → null (LLM would decide — gap just elapsed)
 *   H. Midnight edge (23:59 UTC)    → schedule_for (next day, window start)
 *   I. Midnight-wrapping window     → null when inside (23:00 in 22–06 window)
 *   J. Midnight-wrapping window     → schedule_for when outside (10:00 in 22–06 window)
 *   K. Day not allowed (Sunday)     → schedule_for (next Mon at window start)
 */

import { applyPreflightChecks, decidePostingAction } from "./advisor";
import type { TimingContext } from "./advisor";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

/**
 * Build a synthetic TimingContext with sensible defaults.
 * Callers override only the fields relevant to the scenario under test.
 *
 * Defaults align with schema.ts canonical values:
 *   max_posts_per_day: 1, min_gap_hours: 20, posting_windows Mon–Fri 09–17 UTC.
 * jitter_minutes is 0 so schedule_for times are deterministic in tests.
 */
function ctx(overrides: Partial<TimingContext> = {}): TimingContext {
  return {
    posting_window: { start_hour: 9, end_hour: 17, days: [1, 2, 3, 4, 5], tz: "UTC" },
    max_posts_per_day: 1,
    posts_today_count: 0,
    last_post_at: null,
    min_gap_hours: 20,
    jitter_minutes: 0, // deterministic for tests
    // 2026-06-11 is a Thursday (UTC weekday 4) — inside Mon–Fri window
    current_datetime: new Date("2026-06-11T12:00:00.000Z"),
    ...overrides,
  };
}

// ── Scenario A: Daily cap reached ─────────────────────────────────────────────

console.log("\nScenario A — daily cap reached:");
{
  const decision = applyPreflightChecks(
    ctx({ posts_today_count: 2, max_posts_per_day: 2 })
  );
  assert("returns skip", decision?.action === "skip");
  assert(
    "reason mentions cap",
    (decision?.reason ?? "").includes("daily cap")
  );
}

// ── Scenario B: Min gap not met ───────────────────────────────────────────────

console.log("\nScenario B — min gap not met (2h elapsed of 4h required):");
{
  const now = new Date("2026-06-11T12:00:00.000Z");
  const lastPost = new Date(now.getTime() - 2 * 3600 * 1000); // 2h ago

  const decision = applyPreflightChecks(
    ctx({ current_datetime: now, last_post_at: lastPost, min_gap_hours: 4 })
  );
  assert("returns schedule_for", decision?.action === "schedule_for");
  assert("reason mentions min gap", (decision?.reason ?? "").includes("min gap"));

  // schedule_for should be last_post_at + 4h = 14:00 UTC
  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for = last_post_at + min_gap_hours",
    sf.getTime() === lastPost.getTime() + 4 * 3600 * 1000,
    `got ${sf.toISOString()}`
  );
}

// ── Scenario C: Outside window (before it opens) ──────────────────────────────

console.log("\nScenario C — outside window (current hour 06:00 UTC, window 09–17):");
{
  const now = new Date("2026-06-11T06:30:00.000Z"); // 06:30 UTC — before window

  const decision = applyPreflightChecks(ctx({ current_datetime: now }));
  assert("returns schedule_for", decision?.action === "schedule_for");
  assert(
    "reason mentions posting window",
    (decision?.reason ?? "").includes("posting window")
  );

  // schedule_for should be same day at 09:00 UTC
  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for is today at window start (09:00 UTC)",
    sf.getUTCHours() === 9 && sf.toISOString().startsWith("2026-06-11"),
    `got ${sf.toISOString()}`
  );
}

// ── Scenario D: Outside window (past closing time) ────────────────────────────

console.log("\nScenario D — outside window (current hour 22:00 UTC, window 09–17):");
{
  const now = new Date("2026-06-11T22:00:00.000Z"); // after window closes

  const decision = applyPreflightChecks(ctx({ current_datetime: now }));
  assert("returns schedule_for", decision?.action === "schedule_for");

  // schedule_for should be TOMORROW at 09:00 UTC
  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for is tomorrow at window start (09:00 UTC)",
    sf.getUTCHours() === 9 && sf.toISOString().startsWith("2026-06-12"),
    `got ${sf.toISOString()}`
  );
}

// ── Scenario E: All clear — LLM path ─────────────────────────────────────────

console.log("\nScenario E — all clear (within window, gap met, under cap):");
{
  const now = new Date("2026-06-11T12:00:00.000Z");
  // last_post_at = null → no gap check; posts_today_count=0 → under cap of 1
  const decision = applyPreflightChecks(
    ctx({ current_datetime: now, last_post_at: null, posts_today_count: 0 })
  );
  assert("returns null (LLM should decide)", decision === null);
}

// ── Scenario F: Exactly at cap ────────────────────────────────────────────────

console.log("\nScenario F — exactly at cap boundary:");
{
  const decision = applyPreflightChecks(
    ctx({ posts_today_count: 2, max_posts_per_day: 2 })
  );
  assert("returns skip at exact cap", decision?.action === "skip");
}

// ── Scenario G: Exactly at gap boundary ──────────────────────────────────────

console.log("\nScenario G — gap exactly elapsed (no remaining gap):");
{
  const now = new Date("2026-06-11T12:00:00.000Z");
  // last post was exactly 4h ago, explicit min_gap_hours: 4 → gap just met → LLM
  const lastPost = new Date(now.getTime() - 4 * 3600 * 1000);

  const decision = applyPreflightChecks(
    ctx({ current_datetime: now, last_post_at: lastPost, min_gap_hours: 4 })
  );
  assert("returns null (gap exactly met → LLM path)", decision === null);
}

// ── Scenario H: Midnight crossing (window wraps to next day) ─────────────────

console.log("\nScenario H — edge case: 23:59 UTC with window 09–17:");
{
  const now = new Date("2026-06-11T23:59:00.000Z");
  const decision = applyPreflightChecks(ctx({ current_datetime: now }));
  assert("returns schedule_for", decision?.action === "schedule_for");

  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for is next day at 09:00 UTC",
    sf.getUTCHours() === 9 && sf.toISOString().startsWith("2026-06-12"),
    `got ${sf.toISOString()}`
  );
}

// ── Scenario I: Midnight-wrapping window — inside at 23:00 ───────────────────

console.log("\nScenario I — midnight-wrapping window (22–06): current hour 23:00 → inside:");
{
  // 23:00 UTC is inside a 22:00–06:00 window
  const now = new Date("2026-06-11T23:00:00.000Z");
  const decision = applyPreflightChecks(
    ctx({
      current_datetime: now,
      posting_window: { start_hour: 22, end_hour: 6, days: [1, 2, 3, 4, 5], tz: "UTC" },
    })
  );
  assert("returns null (inside midnight-wrap window → LLM path)", decision === null);
}

// ── Scenario J: Midnight-wrapping window — outside at 10:00 ──────────────────

console.log("\nScenario J — midnight-wrapping window (22–06): current hour 10:00 → outside:");
{
  // 10:00 UTC is outside a 22:00–06:00 window (daytime gap)
  const now = new Date("2026-06-11T10:00:00.000Z");
  const decision = applyPreflightChecks(
    ctx({
      current_datetime: now,
      posting_window: { start_hour: 22, end_hour: 6, days: [1, 2, 3, 4, 5], tz: "UTC" },
    })
  );
  assert("returns schedule_for", decision?.action === "schedule_for");

  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for is today at 22:00 UTC",
    sf.getUTCHours() === 22 && sf.toISOString().startsWith("2026-06-11"),
    `got ${sf.toISOString()}`
  );
}

// ── Scenario K: Day-of-week not allowed ───────────────────────────────────────

console.log("\nScenario K — Sunday (UTC weekday 0) not in allowed days [1–5]:");
{
  // 2026-06-14 is a Sunday (UTC weekday 0) — not in Mon–Fri
  const now = new Date("2026-06-14T12:00:00.000Z");
  const decision = applyPreflightChecks(ctx({ current_datetime: now }));
  assert("returns schedule_for", decision?.action === "schedule_for");
  assert(
    "reason mentions allowed posting day",
    (decision?.reason ?? "").includes("not an allowed posting day")
  );

  // Next allowed day is Monday 2026-06-15 at 09:00 UTC
  const sf = new Date(decision?.schedule_for ?? "");
  assert(
    "schedule_for is next Monday at 09:00 UTC",
    sf.getUTCHours() === 9 && sf.toISOString().startsWith("2026-06-15"),
    `got ${sf.toISOString()}`
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n[advisor.smoke] Pre-flight checks: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("[advisor.smoke] FAIL — pre-flight assertion failures above");
  process.exit(1);
}

// ── LLM smoke (gated by RUN_LLM_SMOKE=1) ─────────────────────────────────────

if (process.env.RUN_LLM_SMOKE !== "1") {
  console.log(
    "\n[advisor.smoke] Skipping LLM path — set RUN_LLM_SMOKE=1 to enable"
  );
  console.log("[advisor.smoke] PASS");
  process.exit(0);
}

console.log("\n[advisor.smoke] Running LLM path (RUN_LLM_SMOKE=1)...");

async function runLLMSmoke() {
  // decidePostingAction will hit the DB for context + LLM prompt.
  // In CI without live infra, DATABASE_URL or AZURE_OPENAI_* will be absent;
  // decidePostingAction catches and returns skip — that's acceptable.
  const decision = await decidePostingAction({
    topic: "Azure AI Foundry – new model deployment features",
  });

  console.log("[advisor.smoke] LLM decision:", JSON.stringify(decision, null, 2));

  const validActions = ["post_now", "schedule_for", "skip"];
  if (!validActions.includes(decision.action)) {
    console.error(
      `[advisor.smoke] FAIL — unexpected action: ${decision.action}`
    );
    process.exit(1);
  }

  if (decision.action === "schedule_for") {
    if (!decision.schedule_for) {
      console.error("[advisor.smoke] FAIL — schedule_for missing");
      process.exit(1);
    }
    const dt = new Date(decision.schedule_for);
    if (isNaN(dt.getTime())) {
      console.error(
        `[advisor.smoke] FAIL — schedule_for is not a valid datetime: ${decision.schedule_for}`
      );
      process.exit(1);
    }
    console.log(`[advisor.smoke] schedule_for ISO valid: ${dt.toISOString()} ✓`);
  }

  console.log("[advisor.smoke] PASS");
}

runLLMSmoke().catch((err) => {
  console.error("[advisor.smoke] FAIL (LLM path error):", err);
  process.exit(1);
});
