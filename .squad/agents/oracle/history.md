# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster. Curates from Microsoft RSS feeds + learn.microsoft.com articles. The "smart" requirement: the system must judge *what* is worth posting and *when* the post will land best.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. LLM provider TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own prompt engineering (draft generation system prompt is at .squad/decisions/decisions.md)
- **IDs you own:** Intelligence wave (prompt design, draft generation, ranking algorithm)
- **Reference:** .squad/decisions/decisions.md contains master prompt (Q7) and all resolved decisions (Q1-Q9)

### 2026-05-05 — WI-01 Foundation PR #3 pending
- **Status:** Tank delivered WI-01 foundation. PR #3 under review by Switch.
- **Your unblock:** Once PR #3 merges, you are unblocked for **WI-03** (LLM client factory).
- **Dependency:** WI-01 establishes env schema, Drizzle ORM, and async job infrastructure.
# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster. Curates from Microsoft RSS feeds + learn.microsoft.com articles. The "smart" requirement: the system must judge *what* is worth posting and *when* the post will land best.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. LLM provider TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own prompt engineering (draft generation system prompt is at .squad/decisions/decisions.md)
- **IDs you own:** Intelligence wave (prompt design, draft generation, ranking algorithm)
- **Reference:** .squad/decisions/decisions.md contains master prompt (Q7) and all resolved decisions (Q1-Q9)

### 2026-05-05 — WI-18 Token usage tracking (DB persistence layer) shipped

**Branch:** `squad/wi-18-token-usage`
**PR:** WI-18: token usage tracking via llm_calls inserts

Replaced the `emitUsageLog` console.log stub in `src/lib/llm/chat.ts` with an async DB INSERT into `llm_calls`. The WI-03 contract (`deployment`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `request_id`) is preserved exactly — field mapping is internal (`deployment→model`, `latency_ms→durationMs`). Extended `UsageLogEntry` with optional `article_id`, `post_id`, `prompt_id` FK fields for future agent callers; backward-compatible (zero existing callers break). The insert is fire-and-forget (`void`), wrapped in try/catch with a `[llm_calls insert failed]` tagged `console.error` — usage logging can never crash an LLM call. Added `src/lib/llm/usage.ts` with `getUsageInRange(start, end)` and `getTotalTokensInRange(start, end)` aggregation helpers (powers WI-17 dashboard), plus `usage.smoke.ts` that exercises insert+query and gracefully skips when DB is unavailable.

### 2026-05-05 — WI-09: LinkedIn post draft generator shipped (PR #12)

`generateDraft(articleId)` — status gate (`status='scored'`), idempotency check, `master_context` from settings, prompt render via `getActivePrompt`/`renderPrompt`, `chat()` for plain-text LLM output, `sanitizeBody()` (strips null bytes, zero-width chars, bold/italic/heading markdown, preserves NBSP for LinkedIn line-break hack), 3000-char Unicode code-point limit, Drizzle INSERT to `posts`, status update to `'selected'`. `generateDraftsForScored()` batch processes all `status='scored'` articles in order, returns settled results.

Key decisions: `chat()` over `chatJSON()` (prompt says "Output ONLY the LinkedIn post text, no JSON wrapper"); Unicode spread `[...body].length` for emoji-safe char count; NBSP preserved intentionally (LLM-instructed blank-line hack); heading stripper `/(^|\n)#{1,6}\s+/g` skips bare hashtags like `#Azure`; WI-07 migration (`0001_article_status.sql`) bundled as dependency — must be de-duped before WI-09 merges if WI-07 lands first. `llm_calls` rows written by `chat()` have no `post_id` FK yet — WI-18 attribution gap.

**PR:** [WI-09: LinkedIn post draft generator](https://github.com/joseg-ai/social-media-agent/pull/12)

### 2026-05-05 — Cross-domain revision: PR #11 (WI-05 feed source CRUD, Tank's work)

Per team protocol, Tank is locked out after Switch's rejection; Oracle handled the revision. Two blockers addressed: (1) `deleteFeedSource` now pre-checks post count via a `posts → articles` JOIN and throws `FeedSourceHasPostsError` (→ DELETE route 409) rather than letting Postgres's `posts.article_id RESTRICT` FK produce an unhandled 500 — the schema is unchanged, RESTRICT stays as the data-safety guard; (2) both `createFeedSource` and `updateFeedSource` now wrap their INSERT/UPDATE in try/catch and convert Postgres error code `23505` (unique_violation) to `DuplicateFeedSourceError`, closing the SELECT→INSERT race window that was returning 500 and making the PATCH route's existing 409 branch live code. Smoke test extended with steps 10–12 to exercise all three new paths. Lint and build green.


**PR:** [WI-10: Prompt management system](https://github.com/joseg-ai/social-media-agent/pull/8)

#### Location choice: `src/lib/prompts/index.ts`

Service layer lives in `@/lib/prompts`, not `@/agents/`, because it's shared library code consumed by both agents (WI-07/08/09) and the API routes backing Trinity's dashboard (WI-16). Agents import it; they don't own it.

#### API surface

| Export | Kind | Description |
|--------|------|-------------|
| `getActivePrompt(name, promptType)` | async fn | Fetch active version for a named key. Throws `PromptNotFoundError`. |
| `getPromptById(id)` | async fn | Fetch any version by UUID. |
| `listPrompts()` | async fn | All versions, all types — sorted name → type → version desc. |
| `listPromptHistory(name, promptType)` | async fn | All versions for one key, newest first. |
| `createPromptVersion(input)` | async fn | Append-only versioning. Atomic deactivate+activate via transaction. |
| `activatePromptVersion(id)` | async fn | Atomic swap / rollback to any prior version. |
| `renderPrompt(prompt, vars)` | fn | `{{variable_name}}` interpolation. Throws `PromptRenderError` on missing vars. |
| `Prompt`, `PromptType`, `CreatePromptVersionInput` | types | Public contract for consumers. |
| `PromptNotFoundError`, `PromptRenderError` | classes | Typed errors. |

#### `getActivePrompt` signature uses (name, promptType) not just a key string

The work plan said `key: string` but the schema uses a composite (name, promptType) as the logical identifier. Keeping both required makes it type-safe — you can't accidentally load a `scoring` prompt where a `drafting` prompt is expected. The string-key pattern would require consumers to do their own type-checking downstream.

#### Seeded prompt keys

| Key | Type | For | Required variables |
|-----|------|-----|--------------------|
| `relevance_scorer` | `scoring` | WI-07 | `{{master_context}}`, `{{article_title}}`, `{{article_summary}}`, `{{article_url}}`, `{{feed_name}}` |
| `timing_advisor` | `timing` | WI-08 | `{{master_context}}`, `{{current_datetime}}`, `{{posting_window}}`, `{{max_posts_per_day}}`, `{{last_post_at}}`, `{{min_gap_hours}}`, `{{post_topic}}` |
| `draft_generator` | `drafting` | WI-09 | `{{master_context}}`, `{{article_url}}`, `{{article_title}}`, `{{article_summary}}` |

`draft_generator` body is the verbatim master prompt from decisions.md Q7 with article-specific variables added.

#### Why isActive flag instead of "latest version always wins"

"Latest wins" requires deleting the bad version to roll back — that destroys the audit trail. `isActive` flag means rollback is a single UPDATE: flip the bad version's flag to false, flip the target version's flag to true, in one transaction. Jose can look at the history and see exactly which version was live at any point. Trinity's dashboard (WI-16) will surface this as a full version list with timestamps.

#### renderPrompt placeholder syntax

`{{variable_name}}` — word characters only (a–z, A–Z, 0–9, underscore), case-sensitive, no spaces inside braces. `PromptRenderError` lists ALL missing vars in one throw, not just the first.

#### Seed and smoke scripts

`seed.ts` uses a standalone postgres connection (not `@/db`) so it only requires `DATABASE_URL` — no other env vars. Idempotent. `smoke.ts` exercises create → list → activate → render with a standalone connection. Deletes its test rows on completion.



**Branch:** `squad/wi-03-azure-openai-client`
**PR:** WI-03: Azure OpenAI typed client wrapper

#### API surface exposed (`@/lib/llm`)

| Export | Kind | Description |
|--------|------|-------------|
| `getLLMClient()` | function | Singleton `AzureOpenAI` client from env vars. API key auth (WI-03 scope); Managed Identity stub left for future. |
| `resetLLMClient()` | function | Clears singleton — test isolation. |
| `chat(opts)` | async fn | One-shot completion → `ChatResult { content, usage, model, latencyMs }` |
| `chatStream(opts)` | async generator | Streaming completion, yields `string` deltas. `stream_options: { include_usage: true }` so usage is captured at stream end. |
| `chatJSON<T>(opts + schema)` | async fn | JSON mode + Zod validation → typed `T`. |
| `AppError` | class | Typed error with `category: LLMErrorCategory`. |
| `normalizeLLMError()` | function | Wraps any thrown value into `AppError`. |
| `LLMErrorCategory` | type | `'auth' \| 'ratelimit' \| 'content_filter' \| 'transient' \| 'fatal'` |
| `ChatMessage`, `ChatOptions`, `ChatResult`, `UsageLogEntry` | types | Public contract types. |

#### Error category taxonomy

- **auth** — HTTP 401/403; bad API key, wrong RBAC on deployment
- **ratelimit** — HTTP 429; TPM/RPM exceeded; callers should back off
- **content_filter** — HTTP 400 with `content_filter` code, OR `finish_reason === 'content_filter'`; not retryable
- **transient** — HTTP 5xx, network TypeError; safe to retry with backoff
- **fatal** — everything else (malformed request, programming errors, schema validation failures)

#### Why JSON mode + Zod (vs raw parse)

Azure JSON mode guarantees valid JSON syntax — not schema conformance.  The LLM can hallucinate extra fields or wrong types.  Zod parse gives us:
1. Typed output at the call site (downstream agents get `T`, not `unknown`)
2. Descriptive validation errors that surface schema drift at dev time, not in prod

We also inject a system message describing the desired shape — materially reduces parse failures even in JSON mode.

#### Usage logging shape (WI-18 contract)

Every call (streaming and non-streaming) emits:
```json
{ "deployment": "...", "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "latency_ms": 0, "request_id": "..." }
```
Currently logged to `console.log("[llm_usage]", ...)`.  WI-18 replaces the `emitUsageLog()` body in `src/lib/llm/chat.ts` with an INSERT into `llm_calls`.  Column names should match the JSON keys exactly.

#### env additions

Added `AZURE_OPENAI_API_VERSION` (default: `"2024-10-21"`) to `src/lib/env.ts`.



### 2026-05-05 — WI-07: LLM-powered article relevance scorer — PR #15

**Status:** Complete — PR #15 open, branch `squad/wi-07-relevance-scorer` pushed.

**What was built:**
- `src/lib/scoring/relevance.ts` — core scorer: `scoreArticle(id)` + `scoreUnscoredArticles(opts?)`
- `src/lib/scoring/index.ts` — public re-exports
- `src/lib/scoring/relevance.smoke.ts` — RUN_LLM_SMOKE=1 gated smoke test
- `src/db/migrations/0001_article_status.sql` — `article_status` enum + `status` column + index
- Schema: `articleStatusEnum` + `articles.status` column + `articles_status_idx`
- `RELEVANCE_THRESHOLD` env var (default 70) in `src/lib/env.ts`

**Key design decisions:**
- Score normalisation: v1 `relevance_scorer` prompt returns 0.0-1.0; scorer multiplies by 100 when `score <= 1.0`. Future prompts returning 0-100 integers pass through unchanged.
- Accepts both `reasoning` (v1) and `reason` field names via Zod refine.
- Flows through `chatJSON → chat → emitUsageLog` (WI-18 token tracking). No direct LLM calls.
- `scoreUnscoredArticles` wraps each article in try/catch — one failure never aborts the batch.
- No scheduler — WI-06 cron runner calls `scoreUnscoredArticles`.
- `master_context` loaded from `settings` table; falls back to `""` with `console.warn` if absent.

**Shared workspace note:** Concurrent oracle agent sessions (WI-06/WI-08/WI-09) sharing this working directory repeatedly reset git state, deleting files and switching branches. Commit was eventually made atomically with `git add <explicit paths>` + `git commit -- <explicit paths>`.
