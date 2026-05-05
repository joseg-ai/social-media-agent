# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster ingesting Microsoft RSS feeds and learn.microsoft.com articles, posting at smart times.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. Persistence + scheduling TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own database schema and ORM spike resolution
- **IDs you own:** Foundation wave (schema design, migrations, feed_sources table, prompts table, llm_calls table for token tracking)
- **Reference:** .squad/decisions/decisions.md contains all schema requirements (Q5-Q9) and all resolved decisions (Q1-Q9)

### 2026-05-05 — PR #7 (WI-19 LinkedIn OAuth) rebased onto main; schema.ts merged
- **Rebase pattern:** During parallel work, opened PR #7 with soft-import partial schema (oauth_tokens only); after PR #6 (full Drizzle schema) merged to main, merged main into PR #7 to adopt the full schema wholesale. All OAuth columns verified present in the full schema from PR #6.
- **Unused columns:** oauth_tokens table has redundant iv/auth_tag columns (left unused — encryption stored inside encryptedAccessToken/encryptedRefreshToken in 'iv:ciphertext:authTag' format). Decision note filed at .squad/decisions/inbox/tank-pr-7-rebase.md.
- **Build status:** npm run build + npm run lint both exit 0. PR ready for review.

### 2026-05-05 — PR #4 (WI-03 Azure OpenAI client) revision applied; branch-bleed root cause
- **Blocker 1 (openai dep missing):** During WI-02 schema work, a rebase/merge cycle caused WI-03's `package.json` addition to be silently dropped from `squad/wi-03-azure-openai-client` — `node_modules/openai` didn't exist despite code importing from it. Re-applied `npm install openai@6.36.0 --save`.
- **Blocker 2 (env var missing):** `AZURE_OPENAI_API_VERSION` was never added to `src/lib/env.ts` Zod schema; code read `env.AZURE_OPENAI_API_VERSION` at runtime undefined, falling back to undocumented SDK default. Added `z.string().default("2024-10-21")` to schema; updated `.env.example` to document it.
- **Lesson:** When feature branches merge sibling in-flight branches' work, dependencies and schema changes can silently drop if git history isn't clean. Watch for orphaned imports and runtime undefined errors when integrating branches in parallel. Commit verified with `npm run lint && npm run build` both exit 0.

### 2026-05-05 — WI-02: PostgreSQL schema & initial migration

**Branch:** `squad/wi-02-drizzle-schema` | **PR:** https://github.com/joseg-ai/social-media-agent/pull/6

#### What I built

Seven tables covering Wave 1–3 needs:

| Table | Key decisions |
|-------|--------------|
| `feed_sources` | `poll_interval_minutes` default 120 (2 h), `consecutive_fail_count` resets to 0 on success — drives WI-06 backoff/alert logic |
| `articles` | `content_hash` is SHA-256 hex of title+summary; UNIQUE on `url` + secondary unique on `(url, content_hash)` for belt-and-suspenders dedup; `relevance_score` is nullable until scoring agent runs |
| `posts` | `post_state` enum with `posting` as the idempotency gate; `draft_text` (LLM) and `edited_text` (user) are separate columns; `auto_post` flag for WI-11 autonomous mode |
| `prompts` | Versioned, never deleted. `is_active` flag — only one active per `(name, prompt_type)` enforced at app layer to allow atomic swaps |
| `llm_calls` | Immutable append-only log. `estimated_cost_usd` nullable (unknown pricing = null, not 0). Linked to article, post, and prompt via nullable FKs with `ON DELETE SET NULL` |
| `oauth_tokens` | UNIQUE on `provider` — one token set per OAuth provider. Columns: `iv`, `auth_tag`, `key_version` enable AES-256-GCM key rotation (WI-19) |
| `settings` | JSONB values — can hold primitives, arrays, or objects. String PK (e.g., `"max_posts_per_day"`). No extra table for future settings additions |

#### Technology decisions

- **postgres-js driver** (`postgres` package) — chosen in architecture spike. Used with `max: 10` pool in app client, `max: 1` in migration runner.
- **tsx** as dev dep for running `src/db/migrate.ts` as a TypeScript script without a full build step. Avoided ts-node due to ESM/CJS friction in Next.js 15 projects.
- **`drizzle-orm/postgres-js/migrator`** — built-in migrate function reads SQL files from the migrations folder. Simple, no drizzle-kit runtime required in production.
- **All timestamps `withTimezone: true`** — scheduling system requires timezone-aware timestamps. Postgres stores as UTC; app layer controls timezone display.
- **Enums as pg enums** (`pgEnum`) not check constraints — better type safety, Drizzle generates correct TypeScript types, and Postgres validates at write time.

#### npm scripts added

```
db:generate   drizzle-kit generate          # regenerate SQL from schema
db:migrate    tsx src/db/migrate.ts         # run pending migrations
db:studio     drizzle-kit studio            # GUI schema explorer (dev only)
```

#### Gotchas with Drizzle migrations in this project

1. **Shared working directory race condition** — other agents concurrently staging files caused `git write-tree` to capture polluted index. Solved by using `git worktree add` to get an isolated checkout for committing.
2. **`defaultNow()` is a DB-side expression** — Drizzle generates `DEFAULT now()` in SQL. This is UTC on the docker-compose Postgres (no TZ set). Confirmed correct.
3. **`unique()` vs column-level `.unique()`** — used column-level `.unique()` for single-column constraints and table-level `unique()` for composite constraints. Drizzle generates both correctly.
4. **HMR singleton pattern** — `src/db/index.ts` uses `globalThis` to cache the db instance across Next.js hot reloads in dev, preventing connection pool exhaustion.

