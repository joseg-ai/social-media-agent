/**
 * WI-20 — End-to-end integration test: full pipeline
 *
 * Drives the complete posting pipeline against a real Postgres database:
 *   feed-poll → score → draft → schedule → claim → publish (mock LinkedIn)
 *
 * Mock boundaries (principle: mock at network/external-service edges only):
 *   - rss-parser  : replaced with a fixture that returns 2 inline articles
 *   - @/lib/llm   : chat + chatJSON mocked so no Azure OpenAI calls are made
 *   - fetch       : stubbed for api.linkedin.com UGC Posts endpoint
 *   - @/lib/linkedin/tokens : getValidAccessToken mocked (avoids AES decrypt)
 *   - @/lib/timing/advisor  : decidePostingAction returns post_now to keep
 *                             the test deterministic and independent of clock
 *
 * Real code exercised: Drizzle ORM, DB schema, feed ingest, article dedup,
 *   relevance scorer (prompt render + Zod parse path), draft generator
 *   (sanitizeBody, char-limit enforcement), post state machine, publisher.
 *
 * Skip behaviour:
 *   If DATABASE_URL is not set the entire suite is skipped with a clear console
 *   message. The npm test run exits 0 so CI remains green when no DB is present.
 *
 * Setup:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/sma_test npm test
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";

// ── Mock boundaries — hoisted by vitest before any imports ────────────────────

// 1. RSS feed boundary — returns 2 deterministic inline articles on every call
vi.mock("rss-parser", () => {
  const FIXTURE_ITEMS = [
    {
      title: "Azure AI Foundry is now Generally Available",
      link: "https://techcommunity.microsoft.com/azure-ai-foundry-ga",
      contentSnippet:
        "Microsoft announces Azure AI Foundry reaches general availability, bringing enterprise-grade model deployment to every Azure customer.",
      pubDate: "Mon, 01 Jan 2026 10:00:00 GMT",
      guid: "https://techcommunity.microsoft.com/azure-ai-foundry-ga",
    },
    {
      title: "Minor npm utility patch release",
      link: "https://npmjs.com/some-package/v1.2.3",
      contentSnippet:
        "A small npm utility released a patch update fixing a minor bug.",
      pubDate: "Mon, 01 Jan 2026 09:00:00 GMT",
      guid: "https://npmjs.com/some-package/v1.2.3",
    },
  ];

  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({ items: FIXTURE_ITEMS }),
    })),
  };
});

// 2. Azure OpenAI boundary — chat and chatJSON are stub fns configured per test
vi.mock("@/lib/llm", async () => {
  return {
    chat: vi.fn(),
    chatJSON: vi.fn(),
    chatStream: vi.fn(),
    getLLMClient: vi.fn(),
    resetLLMClient: vi.fn(),
    AppError: class AppError extends Error {
      constructor(
        message: string,
        public readonly category?: string,
        public readonly detail?: unknown,
      ) {
        super(message);
        this.name = "AppError";
      }
    },
    normalizeLLMError: (err: unknown) => err,
    getUsageInRange: vi.fn().mockResolvedValue([]),
    getTotalTokensInRange: vi.fn().mockResolvedValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    listRecentCalls: vi.fn().mockResolvedValue([]),
    estimateCostUsd: vi.fn().mockReturnValue(0),
    PRICING_USD_PER_1K_TOKENS: {},
    DEFAULT_PRICING: {},
  };
});

// 3. LinkedIn token boundary — avoid AES-256-GCM decrypt requirement
vi.mock("@/lib/linkedin/tokens", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("fake-test-access-token"),
  storeTokenResponse: vi.fn(),
  isLinkedInConnected: vi.fn().mockResolvedValue(true),
}));

// 4. Timing advisor boundary — always returns post_now so the post is
//    immediately claimable regardless of clock or window settings
vi.mock("@/lib/timing/advisor", () => ({
  decidePostingAction: vi.fn().mockResolvedValue({
    action: "post_now",
    reason: "e2e test: bypassing window checks, posting immediately",
  }),
  getPostingContext: vi.fn(),
  applyPreflightChecks: vi.fn(),
}));

// ── Conditional skip ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "\n⚠  [e2e/full-pipeline] SKIPPED — requires DATABASE_URL env var.\n" +
      "   Set it to a running Postgres instance before running E2E tests.\n" +
      "   Example: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sma_test npm test\n",
  );
}

// ── Imports of real production modules ───────────────────────────────────────
// These are imported AFTER vi.mock calls (vitest hoists mocks ahead of imports).
// All modules that transitively import @/lib/llm, @/lib/timing/advisor, or
// @/lib/linkedin/tokens will receive the mocked versions.

import { db } from "@/db";
import * as schema from "@/db/schema";
import { chat, chatJSON } from "@/lib/llm";
import { ingestFeed } from "@/lib/feeds/ingest";
import { scoreUnscoredArticles } from "@/lib/scoring/relevance";
import { generateDraftsForScored } from "@/lib/drafts/generator";
import { scheduleAllDrafts } from "@/lib/posts/scheduler";
import { claimReadyPosts, publishPost } from "@/lib/posts/publisher";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "db", "migrations");

/** Minimal LLM scoring response satisfying llmResponseSchema. */
function scoringResponse(score: number) {
  return { score, reasoning: `Test reasoning for score ${score}.`, topics: ["azure"] };
}

/** Minimal LLM chat result satisfying ChatResult. */
const DRAFT_CHAT_RESULT = {
  content:
    "Azure AI Foundry is now GA — this is huge for enterprise teams.\u00a0\n" +
    "Check it out: https://techcommunity.microsoft.com/azure-ai-foundry-ga\u00a0\n" +
    "#Azure #AI #Microsoft #Houston #Texas",
  usage: { promptTokens: 120, completionTokens: 180, totalTokens: 300 },
  model: "gpt-4o",
  latencyMs: 450,
};

/** Seed the minimum fixtures every test needs. */
async function seedFixtures(): Promise<{ feedSourceId: string }> {
  // Feed source
  const [feedSource] = await db
    .insert(schema.feedSources)
    .values({
      name: "Test Microsoft Blog",
      url: "https://fake-rss-feed.example.com/feed.xml",
      enabled: true,
    })
    .returning({ id: schema.feedSources.id });

  // Prompts (minimal content — LLM is mocked, rendered text doesn't matter)
  await db.insert(schema.prompts).values([
    {
      name: "relevance_scorer",
      promptType: "scoring",
      content: "Rate this article: {{article_title}}",
      version: 1,
      isActive: true,
    },
    {
      name: "timing_advisor",
      promptType: "timing",
      content: "When to post: {{post_topic}}",
      version: 1,
      isActive: true,
    },
    {
      name: "draft_generator",
      promptType: "drafting",
      content: "Write a LinkedIn post about: {{article_title}}",
      version: 1,
      isActive: true,
    },
  ]);

  // Settings — generous defaults that don't constrain the test
  await db.insert(schema.settings).values([
    { key: "max_posts_per_day", value: 10 },
    { key: "min_gap_hours", value: 0 },
    { key: "jitter_minutes", value: 0 },
    // Empty days array = every day allowed; 0-0 window = always open (non-wrapping)
    { key: "posting_windows", value: { days: [], startHour: 0, endHour: 23, tz: "UTC" } },
    { key: "relevance_threshold", value: 70 },
  ]);

  // OAuth tokens row — person URN cached so poster.ts skips /v2/userinfo fetch
  await db.insert(schema.oauthTokens).values({
    provider: "linkedin",
    // Placeholder values: getValidAccessToken is mocked, decrypt is never called
    encryptedAccessToken: "placeholder-encrypted",
    iv: "placeholder-iv",
    authTag: "placeholder-tag",
    linkedinPersonUrn: "urn:li:person:e2e-test-user",
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  return { feedSourceId: feedSource.id };
}

/** Truncate all application tables in dependency order (CASCADE handles FKs). */
async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE
      posts,
      llm_calls,
      articles,
      feed_sources,
      prompts,
      settings,
      oauth_tokens
    CASCADE`,
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe.skipIf(!DATABASE_URL)("Full pipeline E2E (WI-20)", () => {
  // ── One-time setup: clean schema + migrations ────────────────────────────────

  beforeAll(async () => {
    // Use a dedicated connection for DDL — migrations require exclusive access.
    const adminSql = postgres(DATABASE_URL!, { max: 1 });
    try {
      await adminSql`DROP SCHEMA public CASCADE`;
      await adminSql`CREATE SCHEMA public`;
      const adminDb = drizzle(adminSql);
      await migrate(adminDb, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await adminSql.end();
    }
  }, 60_000);

  // ── Per-test cleanup ─────────────────────────────────────────────────────────

  afterEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    // db singleton is module-level — do not close it here (other tests may run)
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it(
    "happy path: ingest → score → draft → schedule → claim → publish",
    async () => {
      const { feedSourceId } = await seedFixtures();

      // Configure LLM mocks:
      //   chatJSON call 1 → article 1 (Azure AI Foundry): score 80 → selected
      //   chatJSON call 2 → article 2 (npm patch):         score 50 → rejected
      vi.mocked(chatJSON)
        .mockResolvedValueOnce(scoringResponse(80))
        .mockResolvedValueOnce(scoringResponse(50));

      vi.mocked(chat).mockResolvedValue(DRAFT_CHAT_RESULT);

      // Mock fetch for LinkedIn UGC Posts endpoint
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          json: async () => ({ id: "urn:li:share:fake-12345" }),
        }),
      );

      // ── Step 1: Ingest feed ────────────────────────────────────────────────

      const ingestResult = await ingestFeed(feedSourceId);

      expect(ingestResult.inserted).toBe(2);
      expect(ingestResult.skipped).toBe(0);

      const articlesAfterIngest = await db.select().from(schema.articles);
      expect(articlesAfterIngest).toHaveLength(2);
      expect(articlesAfterIngest.every((a) => a.status === "new")).toBe(true);

      // ── Step 2: Score articles ─────────────────────────────────────────────

      const scoreResult = await scoreUnscoredArticles();

      expect(scoreResult.scored).toBe(1);
      expect(scoreResult.rejected).toBe(1);
      expect(scoreResult.failed).toBe(0);

      const articlesAfterScore = await db.select().from(schema.articles);
      const scoredArticle = articlesAfterScore.find((a) => a.status === "scored");
      const rejectedArticle = articlesAfterScore.find((a) => a.status === "rejected");

      expect(scoredArticle).toBeDefined();
      expect(rejectedArticle).toBeDefined();
      // Score normalisation: 80 → 80 (already in 0-100 range)
      expect(scoredArticle!.relevanceScore).toBe(80);
      expect(rejectedArticle!.relevanceScore).toBe(50);

      // ── Step 3: Generate drafts ────────────────────────────────────────────

      const draftResult = await generateDraftsForScored();

      expect(draftResult.drafted).toBe(1);
      expect(draftResult.failed).toBe(0);

      const postsAfterDraft = await db.select().from(schema.posts);
      expect(postsAfterDraft).toHaveLength(1);
      expect(postsAfterDraft[0]!.state).toBe("draft");
      expect(postsAfterDraft[0]!.draftText).toBeTruthy();
      expect((postsAfterDraft[0]!.draftText ?? "").length).toBeGreaterThan(0);

      // The selected article is marked 'selected' after drafting
      const articlesAfterDraft = await db.select().from(schema.articles);
      const selectedArticle = articlesAfterDraft.find((a) => a.status === "selected");
      expect(selectedArticle).toBeDefined();

      // ── Step 4: Schedule drafts ────────────────────────────────────────────
      // Timing advisor (mocked) returns post_now → scheduledFor = ~now

      const scheduleResult = await scheduleAllDrafts();

      expect(scheduleResult.total).toBe(1);
      expect(scheduleResult.succeeded).toBe(1);
      expect(scheduleResult.skipped).toBe(0);
      expect(scheduleResult.failed).toBe(0);

      const postsAfterSchedule = await db.select().from(schema.posts);
      expect(postsAfterSchedule[0]!.state).toBe("scheduled");
      expect(postsAfterSchedule[0]!.scheduledFor).not.toBeNull();

      // ── Step 5: Claim ready posts ──────────────────────────────────────────
      // scheduled_for was set to ~now in step 4; passing now= ensures it qualifies

      const claimed = await claimReadyPosts({ now: new Date() });

      expect(claimed).toHaveLength(1);
      expect(claimed[0]!.state).toBe("posting");

      const postsAfterClaim = await db.select().from(schema.posts);
      expect(postsAfterClaim[0]!.state).toBe("posting");

      // ── Step 6: Publish ────────────────────────────────────────────────────

      const published = await publishPost(claimed[0]!);

      expect(published.state).toBe("posted");
      expect(published.linkedinPostId).toBe("urn:li:share:fake-12345");
      expect(published.postedAt).not.toBeNull();

      // Verify DB persists the terminal state
      const finalPosts = await db.select().from(schema.posts);
      expect(finalPosts).toHaveLength(1);
      expect(finalPosts[0]!.state).toBe("posted");
      expect(finalPosts[0]!.linkedinPostId).toBe("urn:li:share:fake-12345");
      expect(finalPosts[0]!.postedAt).not.toBeNull();
    },
    30_000,
  );

  // ── Negative: below-threshold articles produce no draft ──────────────────────

  it(
    "articles below relevance threshold → no draft, no orphan posts",
    async () => {
      const { feedSourceId } = await seedFixtures();

      // Both articles score below threshold (70)
      vi.mocked(chatJSON)
        .mockResolvedValueOnce(scoringResponse(45))
        .mockResolvedValueOnce(scoringResponse(38));

      await ingestFeed(feedSourceId);
      const scoreResult = await scoreUnscoredArticles();

      expect(scoreResult.scored).toBe(0);
      expect(scoreResult.rejected).toBe(2);

      const draftResult = await generateDraftsForScored();
      expect(draftResult.drafted).toBe(0);

      // No post rows should exist
      const allPosts = await db.select().from(schema.posts);
      expect(allPosts).toHaveLength(0);

      // Both articles remain 'rejected' — no orphan 'selected' articles
      const allArticles = await db.select().from(schema.articles);
      expect(allArticles).toHaveLength(2);
      expect(allArticles.every((a) => a.status === "rejected")).toBe(true);
    },
    30_000,
  );

  // ── Negative: LinkedIn 422 → post lands in failed with error captured ─────────

  it(
    "LinkedIn 422 → post transitions to failed, failure_reason captured",
    async () => {
      const { feedSourceId } = await seedFixtures();

      vi.mocked(chatJSON)
        .mockResolvedValueOnce(scoringResponse(85)) // article 1 → selected
        .mockResolvedValueOnce(scoringResponse(30)); // article 2 → rejected

      vi.mocked(chat).mockResolvedValue(DRAFT_CHAT_RESULT);

      // LinkedIn returns 422 (content policy violation)
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          json: async () => ({ message: "Content policy violation", status: 422 }),
        }),
      );

      // Run the pipeline up to publish
      await ingestFeed(feedSourceId);
      await scoreUnscoredArticles();
      await generateDraftsForScored();
      await scheduleAllDrafts();

      const claimed = await claimReadyPosts({ now: new Date() });
      expect(claimed).toHaveLength(1);
      expect(claimed[0]!.state).toBe("posting");

      // publishPost must throw (LinkedIn rejected the content)
      await expect(publishPost(claimed[0]!)).rejects.toThrow();

      // Post must be in 'failed' state — transition is atomic
      const failedPosts = await db.select().from(schema.posts);
      expect(failedPosts).toHaveLength(1);
      expect(failedPosts[0]!.state).toBe("failed");
      expect(failedPosts[0]!.failureReason).toBeTruthy();
      expect(failedPosts[0]!.failureCount).toBe(1);

      // No orphan posts outside the posts table (FK constraints verified by DB)
      // Article should still be in 'selected' status (not rolled back — post is the record)
      const articles = await db.select().from(schema.articles);
      expect(articles.some((a) => a.status === "selected")).toBe(true);
    },
    30_000,
  );
});
