# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster curating Microsoft RSS feeds and learn.microsoft.com articles with smart timing.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own dashboard (feed-source CRUD, prompt editor, token/cost dashboard)
- **IDs you own:** Dashboard wave (feed-source management P0, prompt editor with versioning P0, usage/cost dashboard P0)
- **Reference:** .squad/decisions/decisions.md contains dashboard requirements (Q5-Q9) and all resolved decisions (Q1-Q9)

### 2026-05-05 — WI-01 Foundation PR #3 pending
- **Status:** Tank delivered WI-01 foundation. PR #3 under review by Switch.
- **Your unblock:** Once PR #3 merges, you are unblocked for **WI-13** (async job submission framework).
- **Dependency:** WI-01 establishes env schema, Drizzle ORM, and async job infrastructure.

### 2026-05-05 — WI-15 PR #17 revision (Trinity-5 takes over from Trinity-2)

- **Switch review addressed:** 3 findings fixed per lockout rule (Trinity-2 rejected)
- **Fix 1 (BLOCKER):** Deleted `src/lib/posts/queries.ts` — was WI-14 territory, wholly unused by WI-15 code. `git rm`'d from PR.
- **Fix 2 (MEDIUM):** `FeedRow.tsx handleToggle` — added `toggleError` state, checks `res.ok`, parses error body, sets inline error, only calls `router.refresh()` on success. Network errors caught and shown.
- **Fix 3 (MEDIUM):** `AddFeedForm.tsx` — moved `new URL(url).hostname` inside the `try` block so the `finally { setLoading(false) }` covers any `TypeError` from URL parsing. Button no longer gets stuck on "Adding…".
- **Workspace note:** WI-14 untracked files (`history/`, `queue/`, `api/posts/`) in shared workspace reference deleted `queries.ts`; moved them away for build validation, restored after. Build succeeds clean without them.

- **Branch:** `squad/wi-15-feeds-ui` → PR #17 (base: main)
- **Route structure:** `(dashboard)/` layout group; `NAV_LINKS` array at top of `layout.tsx` for easy 3-way merge with parallel agents
- **DB access pattern:** Server Components call service functions directly; client components mutate via REST API
- **force-dynamic:** All DB-calling Server Components need `export const dynamic = "force-dynamic"` — otherwise Next.js 15 prerender fails at build time
- **Drizzle join key gotcha:** Drizzle returns join results keyed by the DB table name string (`feed_sources`), NOT the JS variable name (`feedSources`). Fixed pre-existing bug in `queries.ts`.
- **409 UX:** DELETE `FeedSourceHasPostsError` renders as inline error row with post count (no modal needed)
- **Windows build workaround:** `npx next build` fails with `ENOENT: rename .next/export/500.html` on Next.js 15.5.3. Fix: pre-create `.next/export/` before running build.
- **Shared working directory:** Stage only your own files — other agents' untracked files appear in `src/` but must not be staged.
### 2026-05-05 — WI-17 token/cost dashboard: PR #18 open

- **WI-17 status:** PR #18 open (`squad/wi-17-usage-ui` → main)
- **Files shipped:**
  - `src/lib/llm/pricing.ts` — pricing table + `estimateCostUsd()`
  - `src/lib/llm/usage.ts` — added `listRecentCalls(limit)` function
  - `src/lib/llm/index.ts` — re-exported new functions + pricing
  - `src/app/api/usage/route.ts` — `GET /api/usage?range=today|7d|30d|month`
  - `src/app/(dashboard)/usage/page.tsx` — full dashboard (metrics, bar chart, tables)
- **Layout dependency:** WI-15 PR adds `(dashboard)/layout.tsx` with Usage nav link; WI-17 page depends on it merging first (or simultaneously).
- **Shared workspace lessons:**
  - Multiple agents share one working directory → untracked files from other agents bleed into builds.
  - `git checkout <branch>` does NOT always switch the active branch when HEAD is detached or another agent switches it concurrently. Always verify with `git branch --show-current` after each checkout.
  - Drizzle ORM join result keys use the SQL table name (first arg to `pgTable()`), NOT the JS variable name.
  - All DB-querying Server Component pages need `export const dynamic = "force-dynamic"` to prevent build-time prerender failures when `DATABASE_URL` is absent.

### 2026-05-06 — WI-17 PR #18 revision (Trinity-6 takes over from Trinity-3)
- **Switch review addressed:** Issue 2 only (Issue 1 resolves when PR #17 merges)
- **Fix (BLOCKER):** `src/lib/llm/pricing.ts` — pricing key mismatch with Azure deployment names
  - Added prominent JSDoc on `PRICING_USD_PER_1K_TOKENS` and `estimateCostUsd()` documenting that `llm_calls.model` is set from `env.AZURE_OPENAI_DEPLOYMENT` (the deployment slug, not the canonical OpenAI model name), and fallback behavior
  - Removed dead Claude entries (`claude-sonnet-4.6`, `claude-haiku-4.5`, `claude-opus-4.5`) — all calls route through Azure OpenAI which doesn't serve Claude
  - Fixed `DEFAULT_PRICING`: dropped misleading "GPT-4o rates" claim, relabeled as conservative fallback for unknown slugs, raised to `{ prompt: 0.005, completion: 0.015 }` so unknown models err toward over-reporting cost
- **Branch:** `squad/wi-17-usage-ui` → PR #18 (base: squad/wi-15-feeds-ui)
- **Commit:** `c21c752`
- **Gotcha:** Git working tree chaos from stash + wrong-branch checkout; had to manually reset `squad/wi-14-queue-history-ui` and re-apply changes cleanly on the correct branch

### 2026-05-05 — WI-14 PR #19 submitted

- **Branch:** `squad/wi-14-queue-history-ui` → PR #19 (base: main)
- **Deliverables:**
  - `src/lib/posts/queries.ts` — `listPosts()` / `getPost()` with posts→articles→feed_sources inner join; `PostRow` type with correct field names
  - `GET /api/posts`, `GET/PATCH/DELETE /api/posts/[id]`, `POST /api/posts/[id]/approve`
  - `/queue` page: Server Component, `force-dynamic`, `PostCard` + `EditDraftForm` client components
  - `/history` page: Server Component, `force-dynamic`, 50-per-page pagination, `HistoryPostRow` read-only
- **Schema facts learned:**
  - `postStateEnum` values: `"draft"`, `"scheduled"`, `"posting"`, `"posted"`, `"failed"`, `"cancelled"` — NOT `"published"`
  - Correct field names: `feedSourceName` (not `feedName`), `articleScore` (not `relevanceScore`), `articleScoreReason` (not `scoringReasoning`)
  - Drizzle join result keyed by table name `feed_sources` (not the JS variable `feedSources`)
- **WI-11 coordination:** Direct DB UPDATE used with `TODO(WI-11)` comments; swap for `approveDraft(id)` / `cancelPost(id, reason)` when Tank's WI-11 merges
- **Build quirks:**
  - `tsconfig.tsbuildinfo` + `.next/` stale cache causes tsc "file not found" errors even when files exist — always delete both before `npm run build`
  - Turbopack `npm run build` intermittent ENOENT on Windows; retrying after cache clear resolves it
  - Git branch (`.git/HEAD`) resets to `main` between PowerShell calls in this environment — always `git checkout BRANCH` at start of each call
  - Files written to disk only persist across PowerShell calls if committed to git in the same call
- **Char count:** Use `[...text].length` (spread to code points) not `.length` for accurate Unicode/emoji count against LinkedIn's 3000 char limit
- **UX pattern:** `useTransition` + `router.refresh()` for optimistic UI; no additional state management library needed
### 2026-05-05 — WI-17 token/cost dashboard: PR #18 open

- **WI-17 status:** PR #18 open (`squad/wi-17-usage-ui` → main)
- **Files shipped:**
  - `src/lib/llm/pricing.ts` — pricing table + `estimateCostUsd()`
  - `src/lib/llm/usage.ts` — added `listRecentCalls(limit)` function
  - `src/lib/llm/index.ts` — re-exported new functions + pricing
  - `src/app/api/usage/route.ts` — `GET /api/usage?range=today|7d|30d|month`
  - `src/app/(dashboard)/usage/page.tsx` — full dashboard (metrics, bar chart, tables)
- **Layout dependency:** WI-15 PR adds `(dashboard)/layout.tsx` with Usage nav link; WI-17 page depends on it merging first (or simultaneously).
- **Shared workspace lessons:**
  - Multiple agents share one working directory → untracked files from other agents bleed into builds.
  - `git checkout <branch>` does NOT always switch the active branch when HEAD is detached or another agent switches it concurrently. Always verify with `git branch --show-current` after each checkout.
  - Drizzle ORM join result keys use the SQL table name (first arg to `pgTable()`), NOT the JS variable name.
  - All DB-querying Server Component pages need `export const dynamic = "force-dynamic"` to prevent build-time prerender failures when `DATABASE_URL` is absent.

### 2026-05-06 — WI-17 PR #18 revision (Trinity-6 takes over from Trinity-3)
- **Switch review addressed:** Issue 2 only (Issue 1 resolves when PR #17 merges)
- **Fix (BLOCKER):** `src/lib/llm/pricing.ts` — pricing key mismatch with Azure deployment names
  - Added prominent JSDoc on `PRICING_USD_PER_1K_TOKENS` and `estimateCostUsd()` documenting that `llm_calls.model` is set from `env.AZURE_OPENAI_DEPLOYMENT` (the deployment slug, not the canonical OpenAI model name), and fallback behavior
  - Removed dead Claude entries (`claude-sonnet-4.6`, `claude-haiku-4.5`, `claude-opus-4.5`) — all calls route through Azure OpenAI which doesn't serve Claude
  - Fixed `DEFAULT_PRICING`: dropped misleading "GPT-4o rates" claim, relabeled as conservative fallback for unknown slugs, raised to `{ prompt: 0.005, completion: 0.015 }` so unknown models err toward over-reporting cost
- **Branch:** `squad/wi-17-usage-ui` → PR #18 (base: squad/wi-15-feeds-ui)
- **Commit:** `c21c752`
- **Gotcha:** Git working tree chaos from stash + wrong-branch checkout; had to manually reset `squad/wi-14-queue-history-ui` and re-apply changes cleanly on the correct branch
