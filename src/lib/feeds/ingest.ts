/**
 * Feed ingestion service — fetches, parses, deduplicates, and stores articles.
 *
 * This module owns the "ingest one feed" unit of work. Scheduling (cron,
 * interval, leader election) is intentionally left to WI-06.
 *
 * Error contract:
 *   - Network / parse failures → caught here; last_error_message updated; returns {0,0}
 *   - DB errors                → rethrown (these are programmer errors, not data errors)
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feedSources, articles } from "@/db/schema";
import { parseFeed } from "./parser";

export interface IngestResult {
  inserted: number;
  skipped: number;
}

/**
 * Ingest a single feed source by ID.
 *
 * - Bails early (returns {0,0}) if the source is disabled.
 * - Inserts only articles whose URL doesn't already exist in the articles table
 *   (relies on the globally-unique `articles.url` constraint via onConflictDoNothing).
 * - Updates `last_polled_at` + clears `last_error_message` on success.
 * - Sets `last_error_message` + increments `consecutive_fail_count` on fetch/parse failure.
 *
 * @throws {Error} if the feed source ID is not found, or on DB errors.
 */
export async function ingestFeed(feedSourceId: string): Promise<IngestResult> {
  // ── 1. Load feed source ────────────────────────────────────────────────────
  const [source] = await db
    .select()
    .from(feedSources)
    .where(eq(feedSources.id, feedSourceId))
    .limit(1);

  if (!source) {
    throw new Error(`feed_source not found: ${feedSourceId}`);
  }

  if (!source.enabled) {
    return { inserted: 0, skipped: 0 };
  }

  // ── 2. Fetch + parse ───────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = await parseFeed(source.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(feedSources)
      .set({
        lastErrorMessage: message,
        consecutiveFailCount: source.consecutiveFailCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(feedSources.id, feedSourceId));
    return { inserted: 0, skipped: 0 };
  }

  // ── 3. Insert new articles (bulk, dedup via onConflictDoNothing) ───────────
  let inserted = 0;
  let skipped = 0;

  if (parsed.length > 0) {
    const rows = parsed.map((a) => ({
      feedSourceId,
      title: a.title,
      url: a.url,
      summary: a.summary,
      publishedAt: a.publishedAt,
      author: a.author,
      contentHash: a.contentHash,
      rawMetadata: a.rawMetadata,
    }));

    // onConflictDoNothing silences unique-constraint violations on articles.url.
    // .returning() gives us only the rows actually written — so the count is correct.
    const written = await db
      .insert(articles)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: articles.id });

    inserted = written.length;
    skipped = rows.length - written.length;
  }

  // ── 4. Update feed source metadata ────────────────────────────────────────
  await db
    .update(feedSources)
    .set({
      lastPolledAt: new Date(),
      lastErrorMessage: null,
      consecutiveFailCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(feedSources.id, feedSourceId));

  return { inserted, skipped };
}
