# Product Requirements Document — social-media-agent v0.2

**Author:** Morpheus (Tech Lead)
**Date:** 2026-05-04
**Version:** v0.2 (updated 2026-05-04 — all open questions resolved)
**Status:** Approved for implementation

---

## 1. Overview

An agentic LinkedIn auto-poster that ingests content from Microsoft RSS feeds and learn.microsoft.com, applies LLM-powered judgment to decide **what** is worth sharing and **when** to post for maximum engagement, then drafts LinkedIn posts for human approval (or, once trusted, autonomous posting). The system is single-tenant, built for Jose Guajardo, and runs on Next.js 15 with **Azure OpenAI** for LLM inference, **PostgreSQL** for persistence, and deploys to **Azure App Service** (self-hosted during development).

---

## 2. Problem & Users

| | |
|---|---|
| **Primary user** | Jose Guajardo — Microsoft employee/partner who curates MS-ecosystem content for his LinkedIn audience |
| **Pain** | Manual curation is time-consuming. Finding good articles, rewriting them into LinkedIn-native voice, and timing the post for reach is 30-60 min/day of low-leverage work. |
| **Root cause** | There's no tool that combines *judgment* (what's worth posting?) with *timing intelligence* (when will my audience see it?) and *voice adaptation* (turn a docs link into a compelling post). Existing schedulers are dumb cron jobs. |

---

## 3. Goals

| # | Goal | Measurable Target |
|---|------|-------------------|
| G1 | Consistent posting cadence | 3–5 posts/week without gaps > 3 days |
| G2 | Zero duplicates | Never post the same article twice |
| G3 | Minimal human effort | After tuning, user approves < 30% of suggestions (the rest auto-post) |
| G4 | Engagement-aware timing | System produces a *rationale* per scheduled post explaining why it chose that time slot — not just a cron expression |
| G5 | Safety-first defaults | Auto-post OFF by default, max 1 post/day, dry-run available on day one |

---

## 4. Non-Goals (v1)

- **Multi-platform** — no X/Twitter, no Threads, no Bluesky. LinkedIn only.
- **Multi-tenant / SaaS** — single user, no auth system beyond LinkedIn OAuth for posting.
- **Auto-reply to comments** — posting only, no engagement automation.
- **Image generation** — text posts only; user can manually attach images.
- **Analytics ingestion** — we don't pull LinkedIn analytics back in v1 (future: use impressions to retrain timing model).
- **Content creation from scratch** — we curate and adapt existing articles, not generate thought-leadership from thin air.

---

## 5. User Scenarios

### 5.1 First-Time Setup
Jose connects his LinkedIn account via OAuth, adds 3–5 Microsoft RSS feed URLs, and sets his preferences: posting window (weekdays 7–9 AM CT), max 1 post/day, auto-post OFF. The system begins ingesting immediately and shows him a queue within minutes.

### 5.2 Daily Review (Human-in-the-Loop)
Jose opens the dashboard at 7 AM. The system presents 2 ranked suggestions with draft text, a relevance score, and a timing rationale ("Tuesday 8:15 AM CT — your audience is 40% more active on weekday mornings based on industry benchmarks"). He approves one, edits the other's text, and rejects the third. Approved posts are scheduled.

### 5.3 Fully Autonomous Post
After 2 weeks of approvals, Jose enables auto-post for high-confidence suggestions (score > 0.85). The system posts a learn.microsoft.com article about Azure AI Foundry at 8:22 AM without intervention. Jose sees it in the history log with full rationale.

### 5.4 Low-Quality Day — Nothing to Post
The RSS feeds only have changelog updates and minor patches. The relevance engine scores everything below threshold. The system posts nothing and logs "No content met quality bar (best candidate scored 0.41, threshold 0.60)." Jose's cadence tracker notes the gap but doesn't force a bad post.

### 5.5 Edit-Before-Post
Jose sees a good suggestion but the draft sounds too formal. He edits the text inline, hits "Approve & Schedule." The system posts his edited version at the recommended time, preserving his voice while respecting the timing intelligence.

---

## 6. Functional Requirements

### 6.1 Content Sources

| ID | Requirement | Priority |
|----|-------------|----------|
| CS-1 | Ingest from configurable list of Microsoft RSS/Atom feed URLs | P0 |
| CS-2 | Ingest from learn.microsoft.com (specific doc paths or "What's New" feeds) | P0 |
| CS-3 | Support adding/removing feeds via dashboard UI | P1 |
| CS-4 | Support custom non-Microsoft RSS feeds (future expansion hook) | P2 |

### 6.2 Ingestion & Deduplication

| ID | Requirement | Priority |
|----|-------------|----------|
| IG-1 | Poll feeds on configurable interval (default: every 2 hours) | P0 |
| IG-2 | Deduplicate by URL + content hash — never surface the same article twice | P0 |
| IG-3 | Store raw article metadata (title, summary, URL, published date, source) | P0 |
| IG-4 | Handle feed failures gracefully (retry with backoff, alert after 3 failures) | P1 |

### 6.3 Relevance Scoring (The Agentic "What" Decision)

| ID | Requirement | Priority |
|----|-------------|----------|
| RS-1 | LLM-powered relevance scoring: rate each article 0.0–1.0 against Jose's profile/interests | P0 |
| RS-2 | Configurable interest profile (topics, products, audience) used as scoring context — stored as editable configuration (DB), not hardcoded | P0 |
| RS-3 | Expose score + reasoning in UI ("Why this article?") | P0 |
| RS-4 | Configurable quality threshold (default: 0.60) — below this, article is auto-rejected | P1 |
| RS-5 | Learn from approval/rejection history to improve scoring over time | P2 |

### 6.4 Timing Intelligence (The Agentic "When" Decision)

| ID | Requirement | Priority |
|----|-------------|----------|
| TI-1 | Produce a **rationale** per scheduled post explaining the chosen time — this is not a cron expression, it's a reasoned judgment. Timing prompts stored as editable configuration. | P0 |
| TI-2 | Respect user-defined posting windows (days of week, hours) | P0 |
| TI-3 | Enforce max posts/day (default: 1) and min gap between posts (default: 20 hours) | P0 |
| TI-4 | Use industry engagement data (LinkedIn best-practice heuristics) as baseline timing signal | P0 |
| TI-5 | Avoid posting at identical times daily (add jitter ±30 min) | P1 |
| TI-6 | Incorporate LinkedIn analytics feedback to refine timing (requires analytics ingestion — future) | P2 |

### 6.5 Draft Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| DG-1 | LLM generates LinkedIn-native post text from article metadata using the master prompt (stored as editable config in DB, versionable) | P0 |
| DG-2 | Configurable voice/tone profile (professional, conversational, etc.) — editable via prompt editor in dashboard | P1 |
| DG-3 | Include source link in post | P0 |
| DG-4 | Respect LinkedIn post length limits (3000 chars) | P0 |
| DG-5 | Generate 2–3 draft variants for user to pick from | P2 |

### 6.6 Human-in-the-Loop Modes

| ID | Requirement | Priority |
|----|-------------|----------|
| HL-1 | Default mode: all posts require explicit approval | P0 |
| HL-2 | "Auto-post" mode: posts above confidence threshold are posted without approval | P1 |
| HL-3 | User can edit draft text before approving | P0 |
| HL-4 | User can reject a suggestion (with optional reason for future learning) | P0 |
| HL-5 | User can override suggested time slot | P1 |

### 6.7 Posting & Idempotency

| ID | Requirement | Priority |
|----|-------------|----------|
| PO-1 | Post to LinkedIn via official API (OAuth 2.0, UGC/Posts API) | P0 |
| PO-2 | Idempotent posting — if the system crashes mid-post, it must not double-post on recovery | P0 |
| PO-3 | Dry-run mode: simulate posting without hitting LinkedIn API | P0 |
| PO-4 | Record LinkedIn post ID on success for audit trail | P0 |
| PO-5 | Handle LinkedIn API rate limits (429) with exponential backoff | P1 |

### 6.8 Dashboard UI

| ID | Requirement | Priority |
|----|-------------|----------|
| UI-1 | Queue view: upcoming scheduled posts with draft text, score, timing rationale | P0 |
| UI-2 | History view: past posts with LinkedIn post link, timestamp, rationale | P0 |
| UI-3 | Feed management: add/remove/pause RSS feeds — full CRUD page for feed sources | P0 |
| UI-4 | Settings: posting windows, thresholds, auto-post toggle, voice profile | P1 |
| UI-5 | Ingestion log: recent articles with scores, accept/reject status | P1 |
| UI-6 | Prompt editor: view, edit, and version system prompts (draft generation, scoring) with rollback | P0 |
| UI-7 | Token/cost usage dashboard: daily + monthly token counts, estimated cost per call/day/month | P0 |

---

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Safety** | Never double-post. State machine: `draft → scheduled → posting → posted`. Transition to `posting` is gated by a distributed lock or unique constraint. |
| **Safety** | Dry-run mode available from day one — no LinkedIn API calls until user explicitly enables live posting. |
| **Rate limits** | Respect LinkedIn API quotas. Back off on 429. Never exceed 1 post/day by default. |
| **Observability** | Structured logging for every agent decision (score, timing, post result). Visible in dashboard. |
| **Observability** | **Token usage tracking is a hard requirement.** Every LLM call must log: model, prompt_tokens, completion_tokens, estimated cost (USD). Aggregated per-day and per-month views surfaced in the dashboard. |
| **Privacy** | LinkedIn OAuth tokens stored encrypted at rest. Never logged. Refresh token rotation handled. |
| **Cost discipline** | LLM calls are the primary cost center. Cache scoring results. Batch where possible. Track token usage per day. Target: < $5/month at steady state. |
| **Availability** | Single-user system — brief downtime is acceptable. No SLA, but missed posting windows should be logged. |
| **Data retention** | Keep article + post history indefinitely (it's small). Purge raw feed XML after processing. |

---

## 8. Acceptance Criteria for v1 (MVP)

- [ ] System ingests from ≥ 2 Microsoft RSS feeds and surfaces articles in the dashboard
- [ ] Each article gets a relevance score with human-readable reasoning
- [ ] Top articles get LinkedIn draft text generated automatically
- [ ] Each scheduled post has a timing rationale (not just a timestamp)
- [ ] User can approve, edit, or reject from the dashboard
- [ ] Approved posts are published to LinkedIn via API (with dry-run available)
- [ ] Zero duplicate posts in any 30-day window
- [ ] Auto-post is OFF by default; toggling it on requires explicit action
- [ ] Max 1 post/day enforced regardless of mode
- [ ] History view shows all past posts with rationale and LinkedIn link
- [ ] System runs on Azure App Service (self-hosted during development)

---

## 9. Open Questions

All v1 questions resolved as of 2026-05-04. Future questions accumulate here.

---

## 10. Out-of-Scope / Future

| Feature | Why Later |
|---------|-----------|
| Multi-platform (X, Threads) | Adds API surface, different content formats, different timing models |
| LinkedIn analytics feedback loop | Requires additional API scopes + data pipeline; do timing heuristics first |
| Comment engagement / auto-reply | High risk of sounding robotic; out of scope for v1 |
| Multi-user / SaaS | Adds auth, billing, isolation; build for Jose first |
| Image/carousel generation | Significant complexity; text posts are the MVP |
| Content creation (original thought pieces) | This is a curation agent, not a ghostwriter |
| A/B testing of post variants | Needs analytics loop first |
| Mobile app | Dashboard is web-first |

---

---

## 11. Resolved Decisions

Decisions made by Jose Guajardo on 2026-05-04, resolving all v0.1 open questions.

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| Q1 | LLM provider | OpenAI | Initial answer — superseded by Q5. |
| Q2 | Persistence layer | PostgreSQL | Scalable, well-supported ORM ecosystem. |
| Q3 | Deployment target | Self-host first; Azure App Service for production | Docker-based dev loop, App Service for prod. |
| Q4 | LinkedIn API access | Approved — `w_member_social` scope | No application needed. |
| Q5 | LLM gateway | **Azure OpenAI** (supersedes Q1) | Same models, Azure billing/networking. Use `@azure/openai` SDK or `openai` SDK with Azure endpoint config. |
| Q6 | RSS feeds | Team picks initial set; feed list is pluggable config (DB/config, not hardcoded) | Adding/removing feeds requires zero code changes. |
| Q7 | Posting voice / draft prompt | User-provided master prompt (see `decisions/inbox/squad-prd-v0-1-final-answers.md`) | Stored editable in DB, versionable. |
| Q8 | Dashboard auth | Single-user, simple gate (env-var password or basic auth) | Defer Entra ID until multi-user. |
| Q9 | LLM budget | No hard cap; **track token usage + cost per call/day/month** and surface on dashboard | Observability over enforcement. |

---

*This PRD is the source of truth for v1 work decomposition. All architecture decisions flow from here.*
