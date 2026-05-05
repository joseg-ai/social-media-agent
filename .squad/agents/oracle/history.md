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
