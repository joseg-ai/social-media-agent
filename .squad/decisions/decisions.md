# Decisions Archive

**Purpose:** Centralized record of all squad decisions, resolutions to PRD open questions, and approved design choices. Merged from inbox on 2026-05-04T22:43:00-05:00.

---

## 2026-05-04: PRD v0.1 — Foundational tech decisions

**Date:** 2026-05-04  
**Author:** Jose Guajardo (via Squad)  
**Status:** Approved  

### Decision

- **LLM provider:** OpenAI (Q1)
- **Persistence:** PostgreSQL (Q2)
- **Deployment:** Self-host initially, Azure App Service as the production target (Q3)
- **LinkedIn API:** Access already approved with `w_member_social` scope (Q4)

### Rationale

Answers from Jose to PRD v0.1 Open Questions. These four unblock the rest of the architecture work — Oracle can pick an SDK, Tank can model the schema, Morpheus can plan the deployment topology.

### Team Implications

- **Tank:** design schema for Postgres; pick a migration tool (Prisma vs. Drizzle vs. raw SQL)
- **Oracle:** prompt design targets OpenAI (decide GPT-4o-mini vs. GPT-4o based on cost vs. quality)
- **Morpheus:** factor Azure App Service constraints into v1 architecture (no long-running background workers without a separate Azure Function or WebJob; cron must be external or scheduled triggers)
- **Trinity:** dashboard auth strategy needs to align with Azure (Entra ID is now a natural choice)
- **Open question still:** OpenAI direct API vs. Azure OpenAI Service (the Azure-hosted version of OpenAI models — same models, different billing/networking)

---

## 2026-05-04: PRD v0.1 — Remaining tech & content decisions

**Date:** 2026-05-04  
**Author:** Jose Guajardo (via Squad)  
**Status:** Approved  

### Decision

- **Q5 — LLM gateway:** Azure OpenAI Service (not direct OpenAI API). Aligns with Azure App Service deployment target.
- **Q6 — RSS feeds:** Team picks initial set, but **the feed list MUST be pluggable** — adding/removing feeds in the future cannot require code changes. Treat feed sources as configuration (DB rows or config file), not hardcoded.
- **Q7 — Posting voice / draft prompt:** Use the **master prompt** (defined below) verbatim as the v1 draft-generation system prompt. The prompt MUST be editable later (stored in DB or config, not hardcoded), so Jose can iterate on tone, structure, hashtags, and booking link without redeploying.
- **Q8 — Dashboard auth:** Single-user only for v1. Simple gate is acceptable (env-var password or basic auth). Defer Entra ID until multi-user is needed.
- **Q9 — LLM budget:** No hard cap, but the system MUST **track token usage and cost per call/per day/per month** and surface it on the dashboard. Observability over enforcement.

### Rationale

Final answers from Jose to PRD v0.1 Open Questions. Combined with the Q1-Q4 decisions, the PRD is now fully specified for v1 work decomposition.

### Team Implications

- **Tank:** Schema must include `feed_sources` table (id, url, type [rss|learn], enabled, added_at) and a `prompts` table (id, name, body, version, is_active). Token usage tracking: `llm_calls` table (id, model, prompt_tokens, completion_tokens, cost_usd, called_at, post_id).
- **Oracle:** Ranking + draft prompts read from DB, not from source. Draft prompt for v1 = master prompt (see below). Build a prompt-versioning workflow so Jose can iterate.
- **Trinity:** Dashboard needs (a) feed-source CRUD page, (b) prompt editor page, (c) usage/cost dashboard with daily + monthly token/cost totals.
- **Morpheus:** SDK choice = `@azure/openai` or `openai` SDK with Azure endpoint config; verify Azure App Service can reach Azure OpenAI via private endpoint or public.
- **Switch:** Test the NBSP-spacing rendering — paste a draft into LinkedIn manually before going live; build a snapshot test that asserts every "blank" line in a draft is exactly U+00A0.

### Master Prompt for Draft Generation (Q7) — v1 voice spec

> Stored here as the canonical reference. Oracle's prompt-engineering work starts from this. Treat as configuration data — do NOT hardcode in source.

```
You are an Azure Cloud and AI Solutions Architect with expertise in social media content, specializing in LinkedIn posts that generate real conversations.

Your task is to create an engaging LinkedIn post based on the URL provided. Summarize the content in a conversational, expert tone aligned with Microsoft technologies and industry best practices.

Tone & Style Requirements:
- Keep the tone casual but professional, written the way a real Microsoft architect would naturally speak.
- Avoid robotic or overly promotional language.
- Use your Microsoft expertise to add value and context.
- Do not use en dashes, em dashes or hyphens of any kind.
- Write posts that feel human, friendly and easy to engage with.

LinkedIn Spacing Rules (Very Important):
- LinkedIn collapses blank lines when text is pasted.
- To maintain clean spacing, every intentionally blank line must contain one non-breaking space (U+00A0) character, so the blank line is preserved.
- Use this format inside posts:
  [Paragraph text]
  [NBSP-only line]
  [Paragraph text]
  [NBSP-only line]
  [Paragraph text]
- The blank line must contain a single non-breaking space character. Do not remove or replace it.

Structure of Every LinkedIn Post:
1. Engaging Start — first two lines grab attention without sounding like an ad. Curiosity, shared experiences, or a relatable tech pain point.
2. Informative Summary — summarize the URL content clearly and casually, like a knowledgeable Microsoft expert explaining something interesting.
3. Value Add — insights, interpretations, or implications related to Microsoft cloud, AI, or industry trends.
4. Promote Services (subtle, not salesy) — mention you help customers with migrations, modernization, architecture, AI adoption, optimizations, resiliency, or Microsoft platform improvements. Encourage readers to book time directly.
5. Booking Link — include this exact line:
   📅 Book a call with me
   https://outlook.office.com/bookwithme/user/9a0d77af3c754d50a02a431bd9891c70@microsoft.com/meetingtype/6C0MymekckuZ-iTtGJxrFQ2?anonymous&ismsaljsauthenabled&ep=mLinkFromTile
6. Source URL (always unmasked) — include the full original URL at the end. Never shorten or hide it.
7. Hashtags — 5 relevant hashtags based on URL content. Always include:
   #Houston #Texas #AI #ManagedServices #Azure #Microsoft #Oil #Gas #Energy #Power #Electricity

Output Format:
[Opening lines that grab attention]
[NBSP-only line]
[Informative summary]
[NBSP-only line]
[Insights + subtle service promotion]
[NBSP-only line]
📅 Book a call with me
https://outlook.office.com/bookwithme/user/9a0d77af3c754d50a02a431bd9891c70@microsoft.com/meetingtype/6C0MymekckuZ-iTtGJxrFQ2?anonymous&ismsaljsauthenabled&ep=mLinkFromTile
[NBSP-only line]
🔗 Source:
[Full unmasked URL]
[NBSP-only line]
[5 content hashtags + the required Microsoft/Houston area hashtags]
```

---

## 2026-05-04: v0.1 PRD as Source of Truth

**Date:** 2026-05-04  
**Author:** Morpheus  
**Status:** Active  

### Decision

The Product Requirements Document at `docs/PRD.md` is the authoritative source of truth for v1 work decomposition. All feature tickets, architecture decisions, and sprint scope should trace back to this document.

### Rationale

We need a single reference that the whole squad points at when asking "is this in scope?" Without it, scope creep is inevitable. The PRD encodes Jose's goal (agentic LinkedIn posting from MS content), the explicit non-goals, and the open questions that block implementation.

### Implications

- No implementation work starts until Jose answers the Open Questions (§9) — especially LLM provider and persistence.
- Feature requests not in the PRD get evaluated against Non-Goals before acceptance.
- PRD will be versioned (v0.1 → v0.2 etc.) as decisions are made.

---

## 2026-05-04: PRD v0.2 — All questions resolved, work items decomposed

**Date:** 2026-05-04  
**Author:** Morpheus (Tech Lead)  
**Status:** Approved pending Jose review  

### Decision

PRD v0.2 fully resolves all 9 open questions and decomposes work into 23 tracked items:

**What changed in PRD v0.2:**
- All 9 Open Questions moved to new §11 "Resolved Decisions" with answers
- §9 cleared — placeholder for future questions
- §1 updated: explicitly names Azure OpenAI + PostgreSQL + Azure App Service
- §6.3/6.4/6.5 updated: prompts and feed sources are editable config, not hardcoded
- §6.8 updated: added feed-source management (P0), prompt editor with versioning (P0), token/cost dashboard (P0)
- §7 updated: token usage tracking is a hard non-functional requirement
- §8 updated: deployment target = Azure App Service

**New deliverable:** `docs/work-items.md`
- 23 work items across Foundation → Ingestion → Intelligence → Posting → Dashboard → Observability
- 4 execution waves
- 4 open architectural spikes blocking Wave 1:
  1. ORM selection (Prisma vs. Drizzle vs. raw SQL)
  2. Job runner / background task architecture
  3. Azure OpenAI SDK/auth integration pattern
  4. Token encryption at rest

### Rationale

All PRD open questions now have Jose-approved answers. The work decomposition is unblocked pending Jose approval of the work-item list and Morpheus resolution of the 4 architectural spikes.

### Team Implications

- **Team can begin work once:** Jose approves the work-item list at `docs/work-items.md` AND Morpheus resolves the 4 architectural spikes
- **Wave 1 blocked on:** ORM choice, job runner platform, Azure OpenAI SDK decision, token encryption strategy
- **Work items tracked at:** `docs/work-items.md` (23 items, 4 waves)
- **Reference:** docs/PRD.md v0.2
