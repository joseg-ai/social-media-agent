/**
 * Article relevance scorer — WI-07
 *
 * Scores each ingested article (0-100) using the `relevance_scorer` prompt
 * stored in the `prompts` table.  Articles at or above RELEVANCE_THRESHOLD
 * are marked `scored`; those below are marked `rejected`.
 *
 * Design decisions:
 * - Uses `chatJSON` (JSON mode + Zod) so the LLM response is typed immediately.
 * - Score normalisation: the v1 seeded prompt returns 0.0-1.0; we multiply by
 *   100 when the returned value is <= 1.0.  This keeps the scorer compatible
 *   with future prompt updates that return integers directly.
 * - `scoreUnscoredArticles` is a plain async function - NOT a scheduler.
 *   WI-06 cron runner calls this; we only expose the work function here.
 * - Every LLM call flows through `chatJSON -> chat -> emitUsageLog` (WI-18).
 *
 * Prompt variables expected by `relevance_scorer`:
 *   {{master_context}}   - loaded from settings.master_context (falls back to "")
 *   {{article_title}}    - articles.title
 *   {{article_summary}}  - articles.summary (falls back to "")
 *   {{article_url}}      - articles.url
 *   {{feed_name}}        - feed_sources.name
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { articles, feedSources, settings } from "@/db/schema";
import { chatJSON } from "@/lib/llm";
import { getActivePrompt, renderPrompt } from "@/lib/prompts";
import { env } from "@/lib/env";

// -- Zod schema for LLM response ----------------------------------------------

/**
 * The v1 seeded prompt returns `reasoning`; future prompt versions may use
 * `reason`. We accept both and expose a normalised `reason` field downstream.
 * Score accepts both 0.0-1.0 and 0-100; values <= 1.0 are scaled up to 0-100.
 */
const llmResponseSchema = z
  .object({
    score: z.number().min(0).max(100),
    reasoning: z.string().optional(),
    reason: z.string().optional(),
    // topics emitted by v1 prompt - accepted but not stored
    topics: z.array(z.string()).optional(),
  })
  .refine((d) => Boolean(d.reasoning ?? d.reason), {
    message: "LLM response must contain 'reasoning' or 'reason'",
  });

type LLMResponse = z.infer<typeof llmResponseSchema>;

// -- Public return types -------------------------------------------------------

export interface ScoreResult {
  score: number; // 0-100 (normalised)
  reason: string;
  status: "scored" | "rejected";
}

export interface BatchResult {
  scored: number;
  rejected: number;
  failed: number;
}

// -- Helpers ------------------------------------------------------------------

/** Read master_context from the settings table; falls back to "" with a warning. */
async function getMasterContext(): Promise<string> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "master_context"))
    .limit(1);

  if (rows.length === 0) {
    console.warn(
      "[scoring] settings.master_context not found - rendering prompt with empty master_context"
    );
    return "";
  }

  const val = rows[0].value;
  return typeof val === "string" ? val : String(val ?? "");
}

/**
 * Normalise score to 0-100.
 * Prompts returning 0.0-1.0 are scaled up; 0-100 prompts are used as-is.
 */
function normaliseScore(raw: number): number {
  return raw <= 1.0 ? Math.round(raw * 100) : Math.round(raw);
}

// -- Core scorer --------------------------------------------------------------

/**
 * Score a single article by ID.
 *
 * Safe to call repeatedly - each call overwrites the previous score.
 * Throws on DB errors or LLM hard failures (caller decides whether to catch).
 */
export async function scoreArticle(articleId: string): Promise<ScoreResult> {
  // 1. Load article + feed source name
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      feedName: feedSources.name,
    })
    .from(articles)
    .innerJoin(feedSources, eq(articles.feedSourceId, feedSources.id))
    .where(eq(articles.id, articleId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`scoreArticle: article not found - id=${articleId}`);
  }

  const article = rows[0];

  // 2. Load active relevance_scorer prompt
  const prompt = await getActivePrompt("relevance_scorer", "scoring");

  // 3. Load master_context from settings
  const masterContext = await getMasterContext();

  // 4. Render prompt with article fields
  const rendered = renderPrompt(prompt, {
    master_context: masterContext,
    article_title: article.title,
    article_summary: article.summary ?? "",
    article_url: article.url,
    feed_name: article.feedName,
  });

  // 5. Call LLM with JSON mode - chatJSON fires emitUsageLog internally (WI-18)
  let llmData: LLMResponse;
  try {
    llmData = await chatJSON({
      messages: [{ role: "user", content: rendered }],
      temperature: 0,
      responseFormat: { type: "json_object" },
      schema: llmResponseSchema,
      schemaDescription:
        '{ "score": <number 0-100>, "reasoning": "<string>", "topics": ["<string>"] }',
    });
  } catch (err) {
    throw new Error(
      `scoreArticle: LLM call failed for article ${articleId}: ${String(err)}`
    );
  }

  // 6. Normalise score to 0-100
  const score = normaliseScore(llmData.score);
  const reason = llmData.reasoning ?? llmData.reason ?? "";
  const threshold = env.RELEVANCE_THRESHOLD;
  const status: "scored" | "rejected" = score >= threshold ? "scored" : "rejected";

  // 7. Persist result
  await db
    .update(articles)
    .set({
      relevanceScore: score,
      scoringReasoning: reason,
      scoredAt: new Date(),
      status,
    })
    .where(eq(articles.id, articleId));

  return { score, reason, status };
}

// -- Batch scorer -------------------------------------------------------------

/**
 * Score all articles with status='new', up to `limit` per call.
 *
 * Per-article failures are caught and counted - one bad article never aborts
 * the rest of the batch.
 *
 * WI-06 scheduler calls this function; no cron logic lives here.
 */
export async function scoreUnscoredArticles(
  opts: { limit?: number } = {}
): Promise<BatchResult> {
  const limit = opts.limit ?? 50;

  const pending = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.status, "new"))
    .limit(limit);

  const result: BatchResult = { scored: 0, rejected: 0, failed: 0 };

  for (const { id } of pending) {
    try {
      const { status } = await scoreArticle(id);
      result[status]++;
    } catch (err) {
      result.failed++;
      console.error(`[scoring] Failed to score article ${id}:`, err);
    }
  }

  return result;
}