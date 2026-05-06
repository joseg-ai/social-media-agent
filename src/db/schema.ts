/**
 * Drizzle ORM schema — social-media-agent
 *
 * Tables: feed_sources, articles, posts, prompts, llm_calls, oauth_tokens, settings
 * Covers Wave 1–3 needs (WI-02 through WI-19).
 */
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  real,
  jsonb,
  timestamp,
  uuid,
  varchar,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────────

/** Lifecycle state of an ingested article through the scoring pipeline. */
export const articleStatusEnum = pgEnum("article_status", [
  "new",       // freshly ingested, not yet scored
  "scored",    // passed relevance threshold — eligible for drafting
  "rejected",  // scored below threshold — will not be drafted
  "selected",  // chosen for a LinkedIn post (draft created)
]);

/** State machine for LinkedIn posts. `posting` is the idempotency gate. */
export const postStateEnum = pgEnum("post_state", [
  "draft",
  "scheduled",
  "posting",
  "posted",
  "failed",
  "cancelled",
]);

/** Category of a prompt template stored in the prompts table. */
export const promptTypeEnum = pgEnum("prompt_type", [
  "scoring",
  "drafting",
  "timing",
]);

// ── feed_sources ───────────────────────────────────────────────────────────────

/** Configurable list of RSS/Atom feeds to ingest. Never hardcoded. */
export const feedSources = pgTable(
  "feed_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull().unique(),
    enabled: boolean("enabled").notNull().default(true),
    /** How often to poll, in minutes. Default: 120 (every 2 hours). */
    pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(120),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    /** Incremented on each consecutive failure; reset to 0 on success. */
    consecutiveFailCount: integer("consecutive_fail_count")
      .notNull()
      .default(0),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("feed_sources_enabled_idx").on(t.enabled)],
);

// ── articles ───────────────────────────────────────────────────────────────────

/** Raw article metadata from feeds. Deduplicated by URL + content hash. */
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    feedSourceId: uuid("feed_source_id")
      .notNull()
      .references(() => feedSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url").notNull().unique(),
    /** SHA-256 hex of title+summary — used for dedup alongside URL. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    author: text("author"),
    /** Full parsed feed entry stored for debugging/re-processing. */
    rawMetadata: jsonb("raw_metadata"),
    /** Lifecycle status — set by the scoring agent. Default 'new'. */
    status: articleStatusEnum("status").notNull().default("new"),
    /** Relevance score 0–100. Null until the scoring agent runs. */
    relevanceScore: real("relevance_score"),
    scoringReasoning: text("scoring_reasoning"),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("articles_feed_source_id_idx").on(t.feedSourceId),
    index("articles_published_at_idx").on(t.publishedAt),
    index("articles_relevance_score_idx").on(t.relevanceScore),
    index("articles_status_idx").on(t.status),
    index("articles_created_at_idx").on(t.createdAt),
    // Belt-and-suspenders dedup: unique on both URL (above) + content hash pair
    unique("articles_url_content_hash_uq").on(t.url, t.contentHash),
  ],
);

// ── posts ──────────────────────────────────────────────────────────────────────

/**
 * LinkedIn posts — state machine: draft → scheduled → posting → posted/failed/cancelled.
 * Transition to `posting` is the idempotency gate (prevents double-posts on crash recovery).
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "restrict" }),
    state: postStateEnum("state").notNull().default("draft"),
    /** LLM-generated draft text. */
    draftText: text("draft_text"),
    /** User-edited text (if the user changed the draft before approving). */
    editedText: text("edited_text"),
    /** Human-readable explanation of why this time slot was chosen. */
    timingRationale: text("timing_rationale"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** LinkedIn URN returned on successful post — used as audit trail. */
    linkedinPostId: text("linkedin_post_id"),
    /** Last error message from LinkedIn API or publisher — set by markFailed(). */
    failureReason: text("failure_reason"),
    /** Cumulative count of failed posting attempts — incremented by markFailed(). */
    failureCount: integer("failure_count").notNull().default(0),
    /** Reason the post was cancelled — set by cancelPost(). */
    cancelReason: text("cancel_reason"),
    /** When true, the post was simulated — no real LinkedIn API call was made. */
    isDryRun: boolean("is_dry_run").notNull().default(false),
    /** When true, this post was approved for autonomous posting (no human gate). */
    autoPost: boolean("auto_post").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Scheduler queries: "find scheduled posts past their scheduled_for time"
    index("posts_state_scheduled_for_idx").on(t.state, t.scheduledFor),
    index("posts_article_id_idx").on(t.articleId),
    index("posts_created_at_idx").on(t.createdAt),
  ],
);

// ── prompts ────────────────────────────────────────────────────────────────────

/**
 * Versioned LLM prompt templates.
 * Prompts are never deleted — only versioned. isActive=true marks the one in use.
 * Only one active prompt per (name, promptType) pair should exist at a time
 * (enforced at the application layer, not a DB constraint, to allow atomic swaps).
 */
export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Logical prompt name, e.g. "master-draft", "interest-profile". */
    name: varchar("name", { length: 100 }).notNull(),
    promptType: promptTypeEnum("prompt_type").notNull(),
    content: text("content").notNull(),
    /** Monotonically increasing version number per (name, promptType). */
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    /** Optional human note about what changed in this version. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("prompts_name_type_idx").on(t.name, t.promptType),
    index("prompts_type_active_idx").on(t.promptType, t.isActive),
  ],
);

// ── llm_calls ──────────────────────────────────────────────────────────────────

/**
 * Immutable log of every LLM API call.
 * Token counts and estimated cost are written synchronously after each call.
 * This table is the source of truth for the token/cost dashboard (WI-17, WI-18).
 */
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Azure OpenAI deployment name (e.g., "gpt-4o"). */
    model: varchar("model", { length: 100 }).notNull(),
    promptType: promptTypeEnum("prompt_type"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /** Estimated USD cost at the time of the call. Null if pricing is unknown. */
    estimatedCostUsd: real("estimated_cost_usd"),
    /** Wall-clock duration of the API call in milliseconds. */
    durationMs: integer("duration_ms"),
    /** The article being scored or drafted, if applicable. */
    articleId: uuid("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    /** The post being generated, if applicable. */
    postId: uuid("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    /** The prompt template used, for version traceability. */
    promptId: uuid("prompt_id").references(() => prompts.id, {
      onDelete: "set null",
    }),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Daily/monthly aggregation queries
    index("llm_calls_created_at_idx").on(t.createdAt),
    index("llm_calls_model_idx").on(t.model),
    index("llm_calls_article_id_idx").on(t.articleId),
    index("llm_calls_post_id_idx").on(t.postId),
  ],
);

// ── oauth_tokens ───────────────────────────────────────────────────────────────

/**
 * LinkedIn OAuth tokens — stored AES-256-GCM encrypted at rest.
 * One row per OAuth provider (only LinkedIn for v1).
 * Encryption/decryption happens in src/lib/linkedin/token-crypto.ts (WI-19).
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull().default("linkedin"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    /** Base64-encoded AES-GCM initialization vector. */
    iv: varchar("iv", { length: 64 }).notNull(),
    /** Base64-encoded AES-GCM authentication tag. */
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    /** Tracks which encryption key version was used — enables key rotation. */
    keyVersion: integer("key_version").notNull().default(1),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /**
     * Cached LinkedIn person URN (e.g. "urn:li:person:AbCdEfGhIj").
     * Populated on first UGC post attempt (WI-12) via the userinfo endpoint.
     * Avoids repeated /v2/userinfo round-trips on every publish run.
     */
    linkedinPersonUrn: text("linkedin_person_urn"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Enforce one token set per provider (single-tenant app)
    unique("oauth_tokens_provider_uq").on(t.provider),
  ],
);

// ── settings ───────────────────────────────────────────────────────────────────

/**
 * Application configuration key/value store.
 * Values are JSONB so they can hold primitives, arrays, or objects.
 *
 * Known keys (seeded by migration):
 *   posting_windows      — { days: number[], startHour: number, endHour: number, tz: string }
 *   max_posts_per_day    — number (default: 1)
 *   min_gap_hours        — number (default: 20)
 *   quality_threshold    — number (default: 0.60)
 *   auto_post_enabled    — boolean (default: false)
 *   jitter_minutes       — number (default: 30)
 */
export const settings = pgTable("settings", {
  /** Stable string key, e.g. "max_posts_per_day". */
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
