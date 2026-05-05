/**
 * Smoke test — WI-18 usage persistence layer.
 *
 * Run with:  npx tsx src/lib/llm/usage.smoke.ts
 *
 * Tolerant of DB-unavailable: if the connection fails the test is skipped,
 * not errored — safe to run in CI without a live Postgres instance.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { llmCalls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUsageInRange, getTotalTokensInRange } from "./usage";

const DATABASE_URL = process.env.DATABASE_URL;

async function run() {
  if (!DATABASE_URL) {
    console.log("[usage.smoke] SKIP — DATABASE_URL not set");
    process.exit(0);
  }

  let sql: ReturnType<typeof postgres> | null = null;

  try {
    sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 5 });
    // Quick connectivity probe
    await sql`SELECT 1`;
  } catch {
    console.log("[usage.smoke] SKIP — DB unreachable");
    await sql?.end();
    process.exit(0);
  }

  const db = drizzle(sql, { schema: { llmCalls } });

  // ── Insert a synthetic call ─────────────────────────────────────────────────
  const before = new Date(Date.now() - 1000);

  const [inserted] = await db
    .insert(llmCalls)
    .values({
      model: "smoke-test-model",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      durationMs: 420,
    })
    .returning({ id: llmCalls.id });

  const after = new Date(Date.now() + 1000);

  console.log("[usage.smoke] Inserted row id:", inserted.id);

  // ── Query helpers ───────────────────────────────────────────────────────────
  const rows = await getUsageInRange(before, after);
  const match = rows.find((r) => r.id === inserted.id);

  if (!match) throw new Error("getUsageInRange did not return inserted row");
  if (match.promptTokens !== 100) throw new Error("promptTokens mismatch");
  if (match.completionTokens !== 50) throw new Error("completionTokens mismatch");
  if (match.totalTokens !== 150) throw new Error("totalTokens mismatch");

  console.log("[usage.smoke] getUsageInRange ✓");

  const totals = await getTotalTokensInRange(before, after);

  // Must include at least our inserted row
  if (totals.calls < 1) throw new Error("getTotalTokensInRange returned 0 calls");
  if (totals.prompt < 100) throw new Error("prompt total too low");
  if (totals.completion < 50) throw new Error("completion total too low");
  if (totals.total < 150) throw new Error("total tokens too low");

  console.log("[usage.smoke] getTotalTokensInRange ✓", totals);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  await db.delete(llmCalls).where(eq(llmCalls.id, inserted.id));
  console.log("[usage.smoke] Cleaned up test row");

  await sql.end();
  console.log("[usage.smoke] PASS");
}

run().catch((err) => {
  console.error("[usage.smoke] FAIL", err);
  process.exit(1);
});
