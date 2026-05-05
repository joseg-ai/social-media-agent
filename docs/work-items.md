# v1 Work Items — social-media-agent

**Source:** docs/PRD.md v0.2
**Decomposed by:** Morpheus, 2026-05-04
**Status:** Awaiting Jose's approval

| ID | Title | Owner | Depends On | Priority | Complexity | Description |
|----|-------|-------|-----------|----------|------------|-------------|
| WI-01 | Project foundation & repo structure | @copilot | — | P0 | M | Set up src/ directory structure, path aliases, env-var schema (`.env.example`), Docker Compose for local Postgres, ESLint/Prettier config aligned with project conventions. |
| WI-02 | PostgreSQL schema & migrations | Tank | WI-01 | P0 | M | Design and implement DB schema: `articles`, `posts` (state machine), `feed_sources`, `prompts` (versioned), `llm_calls` (token tracking), `settings`. Pick ORM + migration tool. **Decided:** Drizzle ORM + drizzle-kit migrations + postgres driver. |
| WI-03 | Azure OpenAI service integration | Oracle | WI-01 | P0 | M | Create a typed LLM client wrapper around Azure OpenAI SDK. Handles auth (API key or Managed Identity), retries, token counting, and cost estimation per call. Logs every call to `llm_calls` table. **Decided:** `openai` SDK with AzureOpenAI constructor; dual-mode auth (API key dev, Managed Identity prod). |
| WI-04 | RSS/Atom feed parser | Tank | WI-02 | P0 | S | Generic feed ingestion module: fetch, parse (RSS 2.0 + Atom), extract title/summary/url/published. Support configurable poll interval. |
| WI-05 | Feed source configuration (CRUD) | Tank | WI-02 | P0 | S | API routes for feed_sources CRUD (add, remove, pause, list). Feeds stored in DB — never hardcoded. Seed initial Microsoft feeds via migration. |
| WI-06 | Ingestion scheduler & deduplication | Tank | WI-04, WI-05 | P0 | M | Job that polls all enabled feeds on interval, deduplicates by URL + content hash, stores new articles. Handle feed failures with retry + backoff. **Decided:** node-cron in-process + Postgres advisory locks for leader election. |
| WI-07 | Relevance scoring agent | Oracle | WI-03, WI-06 | P0 | L | LLM-powered scoring: rate each new article 0.0–1.0 using configurable interest profile prompt. Store score + reasoning. Respect quality threshold. |
| WI-08 | Timing intelligence agent | Oracle | WI-03, WI-02 | P0 | M | Produce timing rationale per post. Respect posting windows, max posts/day, min gap, jitter. Uses industry heuristics as baseline signal. |
| WI-09 | Draft generation agent | Oracle | WI-03, WI-07 | P0 | M | Generate LinkedIn post text using master prompt (loaded from `prompts` table). Include source link, respect 3000-char limit, preserve NBSP spacing. |
| WI-10 | Prompt management system | Oracle | WI-02 | P0 | S | Service layer for prompts table: create, read active, update (new version), rollback. Prompts are never deleted, only versioned. |
| WI-11 | Post state machine & scheduling | Tank | WI-02, WI-08, WI-09 | P0 | M | Implement `draft → scheduled → posting → posted/failed` state machine. Unique constraint prevents double-transitions. Scheduling respects timing agent output. |
| WI-12 | LinkedIn API posting service | Tank | WI-11 | P0 | M | Post to LinkedIn via UGC/Posts API (OAuth 2.0, `w_member_social`). Idempotent posting, dry-run mode, record LinkedIn post ID. Handle 429 with backoff. |
| WI-13 | Dashboard auth gate | @copilot | WI-01 | P0 | S | Simple env-var password or basic auth middleware for all dashboard routes. Single-user, no Entra ID. |
| WI-14 | Dashboard — Queue & History views | Trinity | WI-02, WI-13 | P0 | L | Queue page: upcoming posts with draft text, score, timing rationale, approve/edit/reject actions. History page: past posts with LinkedIn link, timestamp, rationale. |
| WI-15 | Dashboard — Feed management page | Trinity | WI-05, WI-13 | P0 | M | Full CRUD UI for feed sources: add URL, toggle enabled/paused, remove. List with last-polled status. |
| WI-16 | Dashboard — Prompt editor with versioning | Trinity | WI-10, WI-13 | P0 | M | View active prompts, edit in-place (creates new version), view version history, rollback to prior version. |
| WI-17 | Dashboard — Token/cost usage page | Trinity | WI-03, WI-13 | P0 | M | Display daily + monthly token counts, estimated cost. Per-call breakdown table. Chart of usage over time. |
| WI-18 | Token usage tracking & aggregation | Tank | WI-03 | P0 | S | Ensure every LLM call writes to `llm_calls`. Add aggregation queries (daily/monthly totals) exposed via API route for the dashboard. |
| WI-19 | LinkedIn OAuth flow | Tank | WI-01 | P0 | M | OAuth 2.0 authorization code flow for LinkedIn. Store tokens encrypted. Handle refresh token rotation. **Decided:** App-level AES-256-GCM encryption via node crypto; key from env var. |
| WI-20 | End-to-end integration test | Switch | WI-06, WI-07, WI-09, WI-11 | P0 | L | Full pipeline test: ingest mock feed → score → draft → schedule → post (dry-run). Assert no duplicates, state transitions correct, token usage logged. |
| WI-21 | NBSP spacing snapshot tests | Switch | WI-09 | P1 | S | Snapshot tests asserting every "blank" line in generated drafts is exactly U+00A0. Validates LinkedIn rendering fidelity. |
| WI-22 | Deployment to Azure App Service | Morpheus | WI-12, WI-14 | P1 | M | Dockerfile, App Service configuration, environment variable setup, Postgres connectivity (Azure DB for Postgres or self-managed). CI/CD pipeline. |
| WI-23 | Settings page (posting windows, thresholds) | Trinity | WI-13, WI-02 | P1 | S | UI for configuring posting windows, quality threshold, auto-post toggle, max posts/day. Reads/writes `settings` table. |

## Suggested execution order

### Wave 1 — Foundation (WI-01, WI-02, WI-03, WI-13, WI-19)
Stand up the project skeleton, database schema, Azure OpenAI client, auth gate, and LinkedIn OAuth. After this wave, we have a running app that can talk to both external services.

### Wave 2 — Ingestion & Storage (WI-04, WI-05, WI-06, WI-10, WI-18)
Feed parsing, feed source management, the ingestion scheduler with dedup, prompt versioning system, and token tracking. After this wave, articles flow into the system and prompts are configurable.

### Wave 3 — Intelligence & Drafting (WI-07, WI-08, WI-09, WI-11)
The three LLM agents (score, time, draft) plus the post state machine. After this wave, the system produces approvable draft posts with timing rationale.

### Wave 4 — Dashboard & Posting (WI-12, WI-14, WI-15, WI-16, WI-17, WI-20, WI-21, WI-22, WI-23)
LinkedIn posting, all dashboard pages, integration tests, and deployment. After this wave, the MVP is live.

## Open architectural spikes

These need resolution before Wave 1 coding begins. Morpheus owns each spike.

1. **ORM choice: Prisma vs Drizzle** — Prisma has better DX and migration story; Drizzle is lighter and more SQL-native. Need to validate Azure App Service compatibility and cold-start impact for both. Decision needed by start of WI-02.

2. **Job runner: BullMQ vs node-cron vs Azure-external trigger** — Feed polling and post scheduling need a reliable recurring job mechanism. BullMQ requires Redis; node-cron is in-process (dies with the app); Azure Timer Triggers or App Service WebJobs are platform-native but add deployment complexity. Decision needed by start of WI-06.

3. **Azure OpenAI SDK & auth method: API key vs Managed Identity** — `@azure/openai` SDK vs `openai` SDK with Azure endpoint config. API key is simpler for dev; Managed Identity is production-correct on App Service. Can we start with key and swap later? Decision needed by start of WI-03.

4. **LinkedIn OAuth token storage & encryption** — Decide encryption-at-rest approach (node `crypto` AES-256-GCM vs database-level encryption vs Azure Key Vault reference). Impacts WI-19 schema design. Decision needed by start of WI-19.
