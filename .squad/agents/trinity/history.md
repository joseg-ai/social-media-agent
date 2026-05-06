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

### 2026-05-05 — WI-15 Feed Management Dashboard UI — PR #17

- **Branch:** `squad/wi-15-feeds-ui` → PR #17 (base: main)
- **Route structure:** `(dashboard)/` layout group; `NAV_LINKS` array at top of `layout.tsx` for easy 3-way merge with parallel agents
- **DB access pattern:** Server Components call service functions directly; client components mutate via REST API
- **force-dynamic:** All DB-calling Server Components need `export const dynamic = "force-dynamic"` — otherwise Next.js 15 prerender fails at build time
- **Drizzle join key gotcha:** Drizzle returns join results keyed by the DB table name string (`feed_sources`), NOT the JS variable name (`feedSources`). Fixed pre-existing bug in `queries.ts`.
- **409 UX:** DELETE `FeedSourceHasPostsError` renders as inline error row with post count (no modal needed)
- **Windows build workaround:** `npx next build` fails with `ENOENT: rename .next/export/500.html` on Next.js 15.5.3. Fix: pre-create `.next/export/` before running build.
- **Shared working directory:** Stage only your own files — other agents' untracked files appear in `src/` but must not be staged.
