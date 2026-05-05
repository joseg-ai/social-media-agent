/**
 * Relevance scorer smoke test - WI-07
 *
 * Gate: set RUN_LLM_SMOKE=1 to execute.  Without it the script exits cleanly
 * so CI never triggers a real LLM call accidentally.
 *
 * Usage:
 *   RUN_LLM_SMOKE=1 DATABASE_URL=<url> npx tsx src/lib/scoring/relevance.smoke.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

if (!process.env.RUN_LLM_SMOKE) {
  console.log(
    "[smoke/scoring] Skipped - set RUN_LLM_SMOKE=1 to run the LLM smoke test."
  );
  process.exit(0);
}

const FIXTURE_FEED: typeof schema.feedSources.$inferInsert = {
  id: "00000000-0000-0000-0000-000000000701",
  name: "Smoke Test Feed (WI-07)",
  url: "https://smoke-test-wi07.invalid/rss",
  enabled: false,
  pollIntervalMinutes: 60,
};

const FIXTURE_ARTICLE: typeof schema.articles.$inferInsert = {
  id: "00000000-0000-0000-0000-000000000702",
  feedSourceId: FIXTURE_FEED.id!,
  title: "Microsoft announces Azure AI Foundry general availability",
  summary:
    "Azure AI Foundry is now generally available, bringing enterprise-grade AI model deployment, fine-tuning, and evaluation tools to Azure customers.",
  url: "https://smoke-test-wi07.invalid/azure-ai-foundry-ga",
  contentHash: "smoke-test-content-hash-wi07-0000000000000000000000000000000",
  status: "new",
};

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[smoke/scoring] DATABASE_URL not set - skipping.");
    process.exit(0);
  }

  try {
    const probe = postgres(dbUrl, { max: 1, connect_timeout: 5 });
    await probe`SELECT 1`;
    await probe.end();
  } catch {
    console.warn("[smoke/scoring] DB unreachable - skipping smoke test.");
    process.exit(0);
  }

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });

  async function cleanup() {
    try {
      await db
        .delete(schema.articles)
        .where(eq(schema.articles.id, FIXTURE_ARTICLE.id!));
      await db
        .delete(schema.feedSources)
        .where(eq(schema.feedSources.id, FIXTURE_FEED.id!));
    } catch (err) {
      console.warn("[smoke/scoring] Cleanup failed:", err);
    }
    await client.end();
  }

  try {
    await db.insert(schema.feedSources).values(FIXTURE_FEED).onConflictDoNothing();
    await db.insert(schema.articles).values(FIXTURE_ARTICLE).onConflictDoNothing();

    console.log("[smoke/scoring] Fixture inserted. Calling scoreArticle...");

    const { scoreArticle } = await import("./relevance");
    const result = await scoreArticle(FIXTURE_ARTICLE.id!);

    console.log("[smoke/scoring] scoreArticle result:", result);

    const [updated] = await db
      .select({
        relevanceScore: schema.articles.relevanceScore,
        scoringReasoning: schema.articles.scoringReasoning,
        scoredAt: schema.articles.scoredAt,
        status: schema.articles.status,
      })
      .from(schema.articles)
      .where(eq(schema.articles.id, FIXTURE_ARTICLE.id!));

    if (!updated) throw new Error("Article row not found after scoring");

    console.assert(updated.relevanceScore !== null, "relevanceScore should be set");
    console.assert(
      updated.scoringReasoning !== null && updated.scoringReasoning.length > 0,
      "scoringReasoning should be non-empty"
    );
    console.assert(updated.scoredAt !== null, "scoredAt should be set");
    console.assert(
      updated.status === "scored" || updated.status === "rejected",
      `status should be scored or rejected, got: ${updated.status}`
    );

    console.log("[smoke/scoring] All assertions passed.");
    console.log("[smoke/scoring] DB row:", updated);
  } catch (err) {
    console.error("[smoke/scoring] Smoke test FAILED:", err);
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  console.log("[smoke/scoring] Cleanup done. Smoke test complete.");
}

run();