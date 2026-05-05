/**
 * Smoke test — WI-09 draft generation service.
 *
 * Tests:
 *   1. generateDraft creates a posts row with valid body for a scored article.
 *   2. generateDraft is idempotent — second call returns existing post.
 *   3. generateDraft rejects an unscored article (ArticleNotScoredError).
 *   4. sanitizeBody strips markdown tokens and control characters.
 *
 * Tests 1–2 require DB + LLM access. Gate with RUN_LLM_SMOKE=1.
 *
 * Usage (DB + LLM):
 *   RUN_LLM_SMOKE=1 \
 *   DATABASE_URL=postgres://... \
 *   AZURE_OPENAI_ENDPOINT=https://... \
 *   AZURE_OPENAI_API_KEY=... \
 *   AZURE_OPENAI_DEPLOYMENT=gpt-4o \
 *   LINKEDIN_CLIENT_ID=x LINKEDIN_CLIENT_SECRET=x \
 *   LINKEDIN_REDIRECT_URI=http://localhost:3000 \
 *   LINKEDIN_TOKEN_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
 *   DASHBOARD_PASSWORD=testpass1 APP_BASE_URL=http://localhost:3000 \
 *   npx tsx src/lib/drafts/generator.smoke.ts
 *
 * Sanitize-only (no DB, no LLM):
 *   SKIP_ENV_VALIDATION=1 npx tsx src/lib/drafts/generator.smoke.ts
 */

import { sanitizeBody, ArticleNotEligibleError } from "./generator";

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ✔  ${label}`);
}

// ── Section 1: sanitizeBody (always runs — no DB/LLM required) ────────────────

console.log("\n── 1. sanitizeBody unit checks ──────────────────────────────────");

assert(sanitizeBody("  hello  ") === "hello", "trims whitespace");
assert(
  sanitizeBody("**bold text** here") === "bold text here",
  "strips **bold**",
);
assert(sanitizeBody("*italic* word") === "italic word", "strips *italic*");
assert(
  sanitizeBody("# Heading line\nrest") === "Heading line\nrest",
  "strips # heading at line start",
);
assert(
  sanitizeBody("#Houston #Azure") === "#Houston #Azure",
  "preserves #hashtags (no space after #)",
);
assert(
  sanitizeBody("line one\n# Section\nline two") === "line one\nSection\nline two",
  "strips # heading mid-document",
);
assert(
  sanitizeBody("hello\x00world") === "helloworld",
  "removes null bytes",
);
assert(
  sanitizeBody("hello\u200Bworld") === "helloworld",
  "removes zero-width space",
);
assert(
  sanitizeBody("hello\uFEFFworld") === "helloworld",
  "removes BOM character",
);
// Verify NBSP is preserved (LinkedIn uses U+00A0 for spacing)
assert(
  sanitizeBody("line\u00A0blank\u00A0line") === "line\u00A0blank\u00A0line",
  "preserves U+00A0 (NBSP) spacing",
);

// ── Section 2: Error classes ──────────────────────────────────────────────────

console.log("\n── 2. Error class checks ────────────────────────────────────────");

const notScoredErr = new ArticleNotEligibleError("test-id", "new");
assert(notScoredErr.name === "ArticleNotEligibleError", "ArticleNotEligibleError name");
assert(notScoredErr.message.includes("test-id"), "ArticleNotEligibleError message includes id");
assert(notScoredErr.message.includes("new"), "ArticleNotEligibleError message includes status");

// ── Section 3: DB + LLM integration (gated by RUN_LLM_SMOKE=1) ───────────────

const RUN_LLM = process.env.RUN_LLM_SMOKE === "1";

if (!RUN_LLM) {
  console.log(
    "\n── 3–5. DB+LLM tests SKIPPED (set RUN_LLM_SMOKE=1 to run) ──────",
  );
  console.log("\n✔  Smoke checks complete (sanitize-only mode).\n");
  process.exit(0);
}

// Dynamic imports so non-LLM path doesn't need these env vars
const { db } = await import("@/db");
const {
  articles,
  feedSources,
  posts,
  settings,
  prompts,
} = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { generateDraft } = await import("./generator");

console.log("\n── 3. Setup: seed feed source + article + prompt ────────────────");

// Seed a minimal feed source for the FK
const [feedSource] = await db
  .insert(feedSources)
  .values({
    name: "smoke-test-feed",
    url: `https://smoke-test.example.com/feed-${Date.now()}`,
    enabled: false,
  })
  .returning({ id: feedSources.id });

console.log(`  ✔  feed source created: ${feedSource.id}`);

// Seed a scored article
const [article] = await db
  .insert(articles)
  .values({
    feedSourceId: feedSource.id,
    title: "Azure AI Foundry: Announcing General Availability",
    summary:
      "Azure AI Foundry is now generally available, bringing enterprise-grade AI model deployment to Microsoft Azure customers.",
    url: `https://azure.microsoft.com/blog/smoke-test-${Date.now()}`,
    contentHash: `smoke-${Date.now()}`,
    status: "scored",
    relevanceScore: 92,
    scoringReasoning:
      "Highly relevant: Azure AI platform announcement with broad audience interest.",
    scoredAt: new Date(),
  })
  .returning({ id: articles.id });

console.log(`  ✔  scored article created: ${article.id}`);

// Seed master_context in settings (upsert)
await db
  .insert(settings)
  .values({
    key: "master_context",
    value: "You are a Microsoft Azure and AI specialist helping to create LinkedIn content for Jose Guajardo, a Microsoft Solutions Architect based in Houston, TX. Voice: professional yet conversational.",
    description: "Smoke test master context",
  })
  .onConflictDoUpdate({
    target: settings.key,
    set: {
      value: "You are a Microsoft Azure and AI specialist helping to create LinkedIn content for Jose Guajardo, a Microsoft Solutions Architect based in Houston, TX. Voice: professional yet conversational.",
    },
  });

console.log("  ✔  master_context seeded");

// Ensure draft_generator prompt exists (seed if missing)
const existingPrompt = await db
  .select({ id: prompts.id })
  .from(prompts)
  .where(
    and(
      eq(prompts.name, "draft_generator"),
      eq(prompts.promptType, "drafting"),
      eq(prompts.isActive, true),
    ),
  )
  .limit(1);

if (existingPrompt.length === 0) {
  await db.insert(prompts).values({
    name: "draft_generator",
    promptType: "drafting",
    content:
      "{{master_context}}\n\nWrite a short LinkedIn post about this article.\n\nTitle: {{article_title}}\nURL: {{article_url}}\nSummary: {{article_summary}}\n\nOutput ONLY the LinkedIn post text, ready to paste. No JSON, no preamble.",
    version: 1,
    isActive: true,
    notes: "smoke test minimal prompt",
  });
  console.log("  ✔  draft_generator prompt seeded (minimal)");
} else {
  console.log("  ✔  draft_generator prompt already present");
}

// ── 4. generateDraft — happy path ─────────────────────────────────────────────

console.log("\n── 4. generateDraft — happy path ────────────────────────────────");

const draft = await generateDraft(article.id);

assert(typeof draft.postId === "string" && draft.postId.length > 0, "postId is non-empty string");
assert(typeof draft.body === "string" && draft.body.length > 0, "body is non-empty string");
assert(draft.characterCount > 0, "characterCount > 0");
assert(draft.characterCount <= 3000, "characterCount <= 3000 (LinkedIn limit)");
assert(draft.alreadyExisted !== true, "alreadyExisted is not set on first call");

// Verify the post row was persisted
const [storedPost] = await db
  .select()
  .from(posts)
  .where(eq(posts.id, draft.postId));

assert(storedPost !== undefined, "post row found in DB");
assert(storedPost.state === "draft", "post state is 'draft'");
assert(storedPost.articleId === article.id, "post.articleId matches");
assert(storedPost.draftText === draft.body, "post.draftText matches returned body");

console.log(`  ℹ  body preview: ${draft.body.slice(0, 100)}…`);
console.log(`  ℹ  characterCount: ${draft.characterCount}`);

// ── 5. generateDraft — idempotency ────────────────────────────────────────────

console.log("\n── 5. generateDraft — idempotency ───────────────────────────────");

const draft2 = await generateDraft(article.id);

assert(draft2.alreadyExisted === true, "second call sets alreadyExisted=true");
assert(draft2.postId === draft.postId, "second call returns same postId");
assert(draft2.body === draft.body, "second call returns same body");

// Verify no duplicate post rows
const allPostsForArticle = await db
  .select({ id: posts.id })
  .from(posts)
  .where(eq(posts.articleId, article.id));

assert(allPostsForArticle.length === 1, "exactly one post row for article");

// ── Cleanup ───────────────────────────────────────────────────────────────────

console.log("\n── Cleanup ──────────────────────────────────────────────────────");

await db.delete(posts).where(eq(posts.articleId, article.id));
await db.delete(articles).where(eq(articles.id, article.id));
await db.delete(feedSources).where(eq(feedSources.id, feedSource.id));

console.log("  ✔  test rows deleted");

await db.$client.end();
console.log("\n✔  All smoke checks passed.\n");
