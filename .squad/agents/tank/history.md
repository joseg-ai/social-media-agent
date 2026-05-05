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


### 2026-05-05 — WI-19: LinkedIn OAuth 2.0 flow

**Branch:** `squad/wi-19-linkedin-oauth` | **PR:** https://github.com/joseg-ai/social-media-agent/pull/7

#### What I built

Three API routes + three lib modules covering the full OAuth authorization code flow:

| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt. Format: `iv:ciphertext:authTag` (all base64, self-contained per token column). 12-byte random IV per call. Key from `LINKEDIN_TOKEN_ENCRYPTION_KEY`. |
| `src/lib/linkedin/oauth.ts` | `getAuthorizationUrl`, `exchangeCodeForToken`, `refreshAccessToken`. Standard fetch only. |
| `src/lib/linkedin/tokens.ts` | `storeTokenResponse` (UPSERT with onConflictDoUpdate), `getValidAccessToken` (auto-refresh 5-min window), `isLinkedInConnected`. |
| `GET /api/linkedin/auth` | Random 32-byte hex state → HttpOnly SameSite=Lax cookie → redirect to LinkedIn. |
| `GET /api/linkedin/callback` | `timingSafeEqual` state check → code exchange → encrypt → UPSERT → clear cookie → redirect. |
| `POST /api/linkedin/disconnect` | Delete `oauth_tokens` row, redirect to `/?linkedin=disconnected`. |

#### Scope rationale

`openid profile w_member_social`:
- `openid` + `profile` — OpenID Connect, gives id_token + user identity (sub, name) for future dashboard display.
- `w_member_social` — post on the member's behalf; required for WI-12.
- Refresh tokens are optional — LinkedIn issues them for the "Sign In with LinkedIn using OpenID Connect" product configuration. Code handles them if present but does not require them.

#### Encryption strategy

- `encryptToken(plaintext)` → `iv_b64:ciphertext_b64:authTag_b64` (compound, self-contained).
- Both `encrypted_access_token` and `encrypted_refresh_token` store the full compound string.
- `iv` and `auth_tag` schema columns hold the access token's IV and auth tag separately — tooling/key-rotation convenience, not needed for decryption.
- `parseEncryptedToken()` helper extracts the parts for DB column mapping.

#### Refresh strategy

`getValidAccessToken()`:
1. Read row from DB.
2. If `expiresAt - now < 5 min` AND refresh token exists → call `refreshAccessToken` → `storeTokenResponse`.
3. If refresh fails but token is still valid → return current token (graceful degradation).
4. If refresh fails and token is expired → throw with reconnect instruction.

#### DB dependency

`src/db/schema.ts` on this branch is a **soft-import** (oauth_tokens only). Full schema is in PR #6. Rebase required after #6 merges. Startup check in `tokens.ts` throws a clear error if the table is missing.

#### env.ts change

Added `SKIP_ENV_VALIDATION=1` support. Required for CI builds where env vars are injected at runtime. Standard T3-stack pattern. No breaking change — validation still runs in dev/prod when the flag is absent.

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

