/**
 * Smoke test for the RSS feed parser + ingestion service.
 *
 * Run with:   npx tsx src/lib/feeds/smoke.ts
 *
 * What it does:
 *   1. Always: fetch + parse a known-stable public feed; print article count.
 *   2. If DATABASE_URL is set AND a feed source ID is provided as argv[2]:
 *      attempt a full ingest and print inserted/skipped counts.
 *
 * This script is intentionally tolerant — it never throws to the top level
 * so CI doesn't fail if the DB isn't available.
 */
import { parseFeed } from "./parser";

const SMOKE_FEED_URL = "https://hnrss.org/frontpage";

async function main() {
  console.log(`\n🔍  Smoke test — RSS parser\n`);
  console.log(`Feed: ${SMOKE_FEED_URL}\n`);

  // ── Step 1: Parse-only (no DB required) ─────────────────────────────────
  let articles;
  try {
    articles = await parseFeed(SMOKE_FEED_URL);
  } catch (err) {
    console.error("❌  parseFeed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`✅  Parsed ${articles.length} articles`);

  if (articles.length > 0) {
    const first = articles[0];
    console.log(`\nFirst article:`);
    console.log(`  title      : ${first.title}`);
    console.log(`  url        : ${first.url}`);
    console.log(`  publishedAt: ${first.publishedAt?.toISOString() ?? "null"}`);
    console.log(`  author     : ${first.author ?? "null"}`);
    console.log(`  summary    : ${(first.summary ?? "").slice(0, 80)}${(first.summary?.length ?? 0) > 80 ? "…" : ""}`);
    console.log(`  contentHash: ${first.contentHash}`);
  }

  // ── Step 2: Full ingest (optional — requires DATABASE_URL + feedSourceId) ─
  const feedSourceId = process.argv[2];
  if (!process.env.DATABASE_URL) {
    console.log(
      "\nℹ️   DATABASE_URL not set — skipping ingest step (parser-only verified above)"
    );
    return;
  }

  if (!feedSourceId) {
    console.log(
      "\nℹ️   Pass a feed_source UUID as argv[2] to test full ingest (e.g. tsx smoke.ts <uuid>)"
    );
    return;
  }

  console.log(`\n🚀  Running ingestFeed(${feedSourceId}) …`);
  try {
    // Dynamic import so the DB client doesn't initialise unless needed.
    const { ingestFeed } = await import("./ingest");
    const result = await ingestFeed(feedSourceId);
    console.log(`✅  inserted: ${result.inserted}, skipped: ${result.skipped}`);
  } catch (err) {
    console.error(
      "❌  ingestFeed failed:",
      err instanceof Error ? err.message : err
    );
  }
}

main();
