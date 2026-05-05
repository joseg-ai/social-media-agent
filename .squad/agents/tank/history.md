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

