# Now

**Last updated:** 2026-05-04 (Jose signed off — resume tomorrow)

## What's live
- Repo: https://github.com/joseg-ai/social-media-agent (synced to origin/main, commit cb6fe5c)
- PRD v0.2: docs/PRD.md
- Work plan: docs/work-items.md (23 WIs, 4 waves)
- Architectural spikes resolved: docs/decisions/2026-05-04-architecture-spikes.md
  - ORM: Drizzle, Job runner: node-cron+pg locks, LLM: openai SDK + AzureOpenAI, Encryption: AES-256-GCM

## Wave 1 status
- 🤖 @copilot — Issue #1 WI-01 (project foundation) — assigned, not started. **Blocks all of Wave 1.**
- 🤖 @copilot — Issue #2 WI-13 (auth gate) — assigned, depends on WI-01.
- ⏸️ Tank — WI-02 (schema), WI-19 (LinkedIn OAuth) — waiting on WI-01
- ⏸️ Oracle — WI-03 (Azure OpenAI client) — waiting on WI-01

## Resume tomorrow with one of:
- "Status" / "Where are we?" — instant catch-up
- "Ralph, go" — auto-monitor @copilot's PR, fan-out Tank+Oracle when WI-01 lands
- "Check on @copilot" — manual peek at issues #1 and #2

## Open question parked
Whether to activate Ralph (B), wait for @copilot WI-01 PR (A), or pre-stage Tank/Oracle on stubs (C). Default recommendation: B (Ralph).
