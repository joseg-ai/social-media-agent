/**
 * Draft generation service — WI-09
 *
 * Generates LinkedIn post drafts from scored articles using the LLM
 * (draft_generator prompt) and persists them to the posts table.
 *
 * Design decisions (see .squad/decisions/inbox/oracle-wi-09-draft-generator.md):
 *
 * - Plain-text output: the draft_generator prompt instructs the model to output
 *   plain text only ("Output ONLY the LinkedIn post text, ready to paste.").
 *   We use chat() — not chatJSON() — because no JSON schema is needed.
 *
 * - Article status gate: articles must have status='scored' (set by WI-07's
 *   relevance scorer) to be eligible for drafting. After a draft is created,
 *   the article is updated to status='selected' so it is never re-drafted.
 *   Idempotency: if a posts row already exists for the article we skip the LLM
 *   and return the existing post (alreadyExisted=true).
 *
 * - Markdown sanitization: the model occasionally wraps output in **bold** or
 *   # heading tokens even when told not to. We lightly strip these. Hashtags
 *   (#Houston, #Azure) are preserved because heading stripping only removes
 *   `# ` (hash + space) at line starts — never a bare `#tag` run-together.
 *
 * - Character limit: LinkedIn allows 3000 chars. If the LLM exceeds this we
 *   log a warning, truncate at 2999 chars, and append "…" — still saving as
 *   draft so humans can review and edit.
 *
 * - model_used / prompt_version_id: the posts table schema (main) has no such
 *   columns. The llm_calls table (written by chat()'s built-in emitUsageLog)
 *   already records the model, tokens, and timing for every call. Prompt version
 *   traceability lives in the prompts table; the prompt id is part of the
 *   rendered text lineage.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, posts, settings } from "@/db/schema";
import { chat } from "@/lib/llm";
import { getActivePrompt, renderPrompt } from "@/lib/prompts";

// ── Constants ─────────────────────────────────────────────────────────────────

const LINKEDIN_CHAR_LIMIT = 3000;

// ── Errors ────────────────────────────────────────────────────────────────────

export class ArticleNotFoundError extends Error {
  constructor(articleId: string) {
    super(`Article not found: ${articleId}`);
    this.name = "ArticleNotFoundError";
  }
}

export class ArticleNotEligibleError extends Error {
  constructor(articleId: string, status: string) {
    super(
      `Article ${articleId} is not eligible for drafting (status="${status}"). ` +
        `Only articles with status="scored" or status="selected" can be drafted.`,
    );
    this.name = "ArticleNotEligibleError";
  }
}

// ── Return types ──────────────────────────────────────────────────────────────

export interface GenerateDraftResult {
  postId: string;
  body: string;
  characterCount: number;
  /** True when the draft already existed — the LLM was not called. */
  alreadyExisted?: boolean;
}

export interface GenerateDraftsForScoredResult {
  drafted: number;
  failed: number;
}

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Clean LLM output for LinkedIn storage.
 *
 * Steps (in order):
 * 1. Trim leading / trailing whitespace.
 * 2. Remove null bytes (\x00) — invalid in Postgres text columns.
 * 3. Remove zero-width characters (U+200B–200D, FEFF, SHY) that are invisible
 *    but corrupt copy-paste behaviour.
 * 4. Strip **bold** markdown → inner text.  LinkedIn renders plain text only;
 *    bold markers appear literally and clutter the post.
 * 5. Strip *italic* markdown → inner text (single-asterisk, not double).
 * 6. Strip `# Heading` markdown at line starts → heading text only.
 *    Uses a match on newline so inline `#hashtag` tokens
 *    (e.g. #Houston, #Azure) are left untouched.
 */
export function sanitizeBody(raw: string): string {
  let s = raw.trim();

  // Null bytes
  s = s.replace(/\x00/g, "");

  // Zero-width and soft-hyphen characters
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");

  // **bold** → bold  (greedy match, handles multi-word spans)
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");

  // *italic* → italic  (single asterisk, skip double already handled)
  s = s.replace(/\*([^*\n]+)\*/g, "$1");

  // # Heading at start of line (including very start of string)
  // \s+ after hashes consumes the space; does NOT touch #hashtag (no space)
  s = s.replace(/(^|\n)#{1,6}\s+/g, "$1");

  return s;
}

// ── Core service ──────────────────────────────────────────────────────────────

/**
 * Generate a LinkedIn post draft for a single article.
 *
 * Idempotent: if a post already exists for this article, returns the existing
 * post without calling the LLM again.
 *
 * @param articleId UUID of the article to draft
 * @throws ArticleNotFoundError     if the article does not exist
 * @throws ArticleNotEligibleError  if the article status is not 'scored' or 'selected'
 */
export async function generateDraft(
  articleId: string,
): Promise<GenerateDraftResult> {
  // ── 1. Load article ────────────────────────────────────────────────────────

  const articleRows = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (articleRows.length === 0) {
    throw new ArticleNotFoundError(articleId);
  }

  const article = articleRows[0];

  // ── 2. Validate status ─────────────────────────────────────────────────────

  if (article.status !== "scored" && article.status !== "selected") {
    throw new ArticleNotEligibleError(articleId, article.status);
  }

  // ── 3. Idempotency check ───────────────────────────────────────────────────

  const existingPost = await db
    .select()
    .from(posts)
    .where(eq(posts.articleId, articleId))
    .limit(1);

  if (existingPost.length > 0) {
    const p = existingPost[0];
    const body = p.draftText ?? "";
    return {
      postId: p.id,
      body,
      characterCount: [...body].length,
      alreadyExisted: true,
    };
  }

  // ── 4. Load master_context from settings ──────────────────────────────────

  const masterContextRows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "master_context"))
    .limit(1);

  const rawMasterContext = masterContextRows[0]?.value;
  const masterContext =
    typeof rawMasterContext === "string"
      ? rawMasterContext
      : rawMasterContext != null
        ? JSON.stringify(rawMasterContext)
        : "";

  // ── 5. Load prompt ─────────────────────────────────────────────────────────

  const prompt = await getActivePrompt("draft_generator", "drafting");

  // ── 6. Render prompt ───────────────────────────────────────────────────────

  const rendered = renderPrompt(prompt, {
    master_context: masterContext,
    article_url: article.url,
    article_title: article.title,
    article_summary: article.summary ?? "",
  });

  // ── 7. Call LLM ───────────────────────────────────────────────────────────

  const result = await chat({
    messages: [{ role: "user", content: rendered }],
    temperature: 0.7,
  });

  // ── 8. Sanitize output ────────────────────────────────────────────────────

  let body = sanitizeBody(result.content);

  // ── 9. Enforce character limit ────────────────────────────────────────────

  // Use spread to count Unicode code points (not UTF-16 code units).
  const codePoints = [...body];

  if (codePoints.length > LINKEDIN_CHAR_LIMIT) {
    console.warn(
      `[drafts] LLM output exceeded LinkedIn limit: ` +
        `${codePoints.length} chars for article ${articleId}. ` +
        `Truncating to ${LINKEDIN_CHAR_LIMIT} and appending "…".`,
    );
    // Truncate at LINKEDIN_CHAR_LIMIT - 1 to leave room for the ellipsis.
    body = codePoints.slice(0, LINKEDIN_CHAR_LIMIT - 1).join("") + "…";
  }

  const characterCount = [...body].length;

  // ── 10. Persist draft post ────────────────────────────────────────────────

  const [inserted] = await db
    .insert(posts)
    .values({
      articleId,
      state: "draft",
      draftText: body,
    })
    .returning({ id: posts.id });

  // ── 11. Mark article as selected ──────────────────────────────────────────

  await db
    .update(articles)
    .set({ status: "selected" })
    .where(eq(articles.id, articleId));

  return {
    postId: inserted.id,
    body,
    characterCount,
  };
}

/**
 * Generate drafts for all scored articles that do not yet have a post.
 *
 * Articles with status='scored' are eligible. Those already at 'selected'
 * (has a post) are skipped via idempotency — generateDraft returns alreadyExisted.
 *
 * @param opts.limit  Maximum number of articles to process (default: 10)
 */
export async function generateDraftsForScored(opts?: {
  limit?: number;
}): Promise<GenerateDraftsForScoredResult> {
  const limit = opts?.limit ?? 10;

  const candidates = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.status, "scored"))
    .limit(limit);

  let drafted = 0;
  let failed = 0;

  for (const { id } of candidates) {
    try {
      const result = await generateDraft(id);
      if (!result.alreadyExisted) drafted++;
    } catch (err) {
      failed++;
      console.error(
        `[drafts] Failed to generate draft for article ${id}:`,
        err,
      );
    }
  }

  return { drafted, failed };
}

