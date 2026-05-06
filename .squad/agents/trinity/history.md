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
