# Now

**Last updated:** 2026-05-05 (WI-01 PR #3 in review)

## What's live
- Repo: https://github.com/joseg-ai/social-media-agent (squad/1-wi-01-project-foundation branch)
- PRD v0.2: docs/PRD.md
- Work plan: docs/work-items.md (23 WIs, 4 waves)
- Architectural spikes resolved: docs/decisions/2026-05-04-architecture-spikes.md
  - ORM: Drizzle, Job runner: node-cron+pg locks, LLM: openai SDK + AzureOpenAI, Encryption: AES-256-GCM

## Wave 1 status
- ✅ Tank — WI-01 (project foundation) — **PR #3 in review by Switch**. Lint + build clean. https://github.com/joseg-ai/social-media-agent/pull/3
- ⏳ Tank — WI-02 (schema), WI-19 (LinkedIn OAuth) — queued, unblocks when PR #3 merges
- ⏳ Oracle — WI-03 (Azure OpenAI client) — queued, unblocks when PR #3 merges
- ⏳ Trinity — WI-13 (async job submission) — queued, unblocks when PR #3 merges

## Resume with
- "Status" — instant catch-up on Wave 1 progress
- "Review PR #3" — Switch to review WI-01 delivery
- "Merge PR #3" — move to main, unblock Tank/Oracle/Trinity

## Next: Switch review + merge WI-01, then Wave 1 parallel execution
