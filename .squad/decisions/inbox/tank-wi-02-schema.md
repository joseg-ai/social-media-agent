# Tank WI-02 — Schema Decisions

**Date:** 2026-05-05  
**Author:** Tank  
**Status:** Merged to PR #6

## Canonical Table List

| Table | Primary Key | Notes |
|-------|------------|-------|
| `feed_sources` | uuid | One row per RSS/Atom feed URL |
| `articles` | uuid | One row per ingested article (deduplicated by URL) |
| `posts` | uuid | One LinkedIn post per article (1:1 in v1) |
| `prompts` | uuid | Versioned; multiple rows per logical prompt name |
| `llm_calls` | uuid | Append-only; one row per API call |
| `oauth_tokens` | uuid | One row per OAuth provider (only `linkedin` in v1) |
| `settings` | varchar PK | Key/value config; string key, JSONB value |

## Enums

### `post_state`
`draft → scheduled → posting → posted | failed | cancelled`

- **Why a Postgres enum, not a check constraint:** Drizzle generates TypeScript types from `pgEnum`, giving compile-time type safety across all query sites. Check constraints don't generate types.
- **Why `posting` state exists:** Idempotency gate. When the scheduler picks up a `scheduled` post, it first transitions to `posting` (atomic update with optimistic lock / unique constraint on state). If the process crashes during posting, the post stays in `posting` — the recovery job can detect and retry or alert, but will never double-post.
- **`cancelled` vs. `failed`:** `cancelled` = user rejected; `failed` = LinkedIn API / system error. Separate states for actionable UI (failed posts should surface for retry; cancelled posts are intentionally done).

### `prompt_type`
`scoring | drafting | timing`

One enum used in both `prompts` and `llm_calls` tables for type traceability.

## Non-Obvious Column Choices

### `articles.content_hash`
- SHA-256 hex of `title + summary` (not the full article body — we don't store raw HTML).
- Dual dedup: UNIQUE on `url` (primary) + composite UNIQUE on `(url, content_hash)` (guards against feed republishing the same URL with different content).
- `varchar(64)` — SHA-256 hex is always 64 characters.

### `articles.relevance_score` — `real` not `numeric`
- `real` (float4) is sufficient for a 0.0–1.0 score. No need for decimal precision — the LLM output is not more precise than 2 decimal places.
- Nullable — null means "not yet scored", distinct from 0.0 (scored and very low relevance).

### `llm_calls.estimated_cost_usd` — nullable `real`
- Null = pricing unavailable for this model (not zero cost). Zero = explicitly free.
- Avoids silent data errors when a new deployment model isn't in the pricing table.

### `oauth_tokens.iv` and `auth_tag` — `varchar(64)`
- AES-256-GCM IV is 12 bytes = 16 base64 chars (well under 64).
- GCM auth tag is 16 bytes = 24 base64 chars (well under 64).
- 64 is generous headroom; no storage waste at 1 row.

### `settings` — string primary key, JSONB value
- No surrogate UUID needed — the key IS the identity.
- JSONB allows the same table to store `1` (integer), `"weekdays"` (string), `[1,2,3,4,5]` (array), and `{"startHour": 7, "tz": "America/Chicago"}` (object) without separate tables.

## Timestamp Convention

All `timestamp` columns use `{ withTimezone: true }` — generates `TIMESTAMP WITH TIME ZONE` in Postgres. Values are stored as UTC. The application layer is responsible for rendering in the user's timezone (America/Chicago for Jose). This is a deliberate choice — storing UTC is the only correct approach for a scheduling system.

## Indexes Rationale

| Index | Table | Columns | Query pattern served |
|-------|-------|---------|---------------------|
| `articles_feed_source_id_idx` | articles | feed_source_id | Load all articles from a feed |
| `articles_published_at_idx` | articles | published_at | Sort/filter recent articles |
| `articles_relevance_score_idx` | articles | relevance_score | Filter above quality threshold |
| `articles_created_at_idx` | articles | created_at | Pagination / ingestion log |
| `feed_sources_enabled_idx` | feed_sources | enabled | Scheduler: fetch only enabled feeds |
| `posts_state_scheduled_for_idx` | posts | (state, scheduled_for) | Scheduler hot path: find scheduled posts past their time |
| `posts_article_id_idx` | posts | article_id | Load post for a given article |
| `llm_calls_created_at_idx` | llm_calls | created_at | Daily/monthly aggregation (GROUP BY date) |
| `llm_calls_model_idx` | llm_calls | model | Cost breakdown by model |
| `llm_calls_article_id_idx` | llm_calls | article_id | "What did we spend scoring this article?" |
| `llm_calls_post_id_idx` | llm_calls | post_id | "What did we spend generating this post?" |

## Migration Tooling

- **Generator:** `drizzle-kit generate` (dev only) — reads schema.ts, diffs against migration history, writes SQL.
- **Runner:** `tsx src/db/migrate.ts` using `drizzle-orm/postgres-js/migrator` — reads SQL files in order, wraps each in a transaction, records in `__drizzle_migrations` table. No drizzle-kit runtime needed in production.
- **No seeding in this migration** — initial settings rows (posting windows, thresholds) will be seeded in WI-05 or WI-11 when the values have confirmed defaults.
