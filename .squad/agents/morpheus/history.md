# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster that curates content from Microsoft RSS feeds and learn.microsoft.com knowledge articles, then posts at intelligently chosen times for best engagement.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, ESLint 9. Bootstrapped from create-next-app.
- **Goal:** Smart, agentic posting — the system must judge *what* is worth sharing and *when* to post for best outcomes.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — Spikes Resolved
Resolved 4 architectural spikes (Drizzle ORM, node-cron + pg advisory locks, openai SDK + AzureOpenAI, AES-256-GCM) — Wave 1 unblocked. Details: `docs/decisions/2026-05-04-architecture-spikes.md`

### 2026-05-04 — v0.1 PRD Drafted
- **Location:** `docs/PRD.md`
- **Key scope decisions:**
  - LinkedIn-only, single-tenant, single-user (Jose)
  - Two agentic decisions: "what" (relevance scoring) and "when" (timing with rationale)
  - Human-in-the-loop by default; auto-post is opt-in after trust is established
  - Safety-first defaults: max 1 post/day, dry-run mode, auto-post OFF
  - Content sources: Microsoft RSS feeds + learn.microsoft.com
  - Non-goals: multi-platform, analytics feedback loop, comment automation, SaaS
- **Open questions:** LLM provider, persistence, deployment target, LinkedIn API access, specific feeds, auth approach — all awaiting Jose's input

### 2026-05-04 — PRD updated to v0.2, work items decomposed
- **PRD:** `docs/PRD.md` is now v0.2 — all 9 open questions resolved and moved to §11 Resolved Decisions.
- **Work Items:** `docs/work-items.md` — 23 work items decomposed across 4 waves. Awaiting Jose's approval.
- **Key additions in v0.2:** token usage tracking as hard NFR, feed-source CRUD as P0, prompt editor with versioning as P0, Azure OpenAI as the LLM gateway.
- **Blocking spikes:** ORM choice (Prisma vs Drizzle), job runner (BullMQ vs node-cron vs Azure triggers), Azure OpenAI auth method, LinkedIn token encryption approach.

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own the architectural spike resolutions (ORM, job runner, Azure OpenAI auth, token encryption)
- **IDs you own:** Foundation wave (schema design, migrations, Azure OpenAI integration), then Ingestion, Intelligence, Posting phases
- **Reference:** .squad/decisions/decisions.md contains all resolved decisions (Q1-Q9)

### 2026-05-04 — Architecture spikes resolved (4/4)
- **Spike 1 (ORM):** Drizzle ORM — lightweight, zero binary overhead, native jsonb support, fast cold-start on App Service.
- **Spike 2 (Job runner):** node-cron in-process with Postgres advisory locks — avoids Redis dependency; advisory locks handle future multi-instance.
- **Spike 3 (Azure OpenAI):** `openai` SDK + AzureOpenAI constructor, dual-mode auth (API key dev / Managed Identity prod) — follows Microsoft's current guidance, no langchain bloat.
- **Spike 4 (Token encryption):** AES-256-GCM via node `crypto`, key from env var — simple, fast, testable; Key Vault migration path documented.
- **Full decision doc:** `docs/decisions/2026-05-04-architecture-spikes.md`
- **Status:** Wave 1 coding is unblocked.
