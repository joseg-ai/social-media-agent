# Switch PR #9 Review — WI-18 Token Usage Tracking

**Date:** 2026-05-05
**Reviewer:** Switch
**PR:** https://github.com/joseg-ai/social-media-agent/pull/9
**Branch:** `squad/wi-18-token-usage`
**Author:** Oracle
**Verdict:** APPROVED WITH NOTES

---

## Summary

Oracle wired `emitUsageLog` to a real DB INSERT into `llm_calls` (replacing the WI-03 console.log stub). Fire-and-forget pattern is correctly implemented. Schema mapping is complete. Two notes — one LOW (missing in-code comment), one INFO (smoke test coupling). No blockers.

---

## Checklist Results

### 1. Fire-and-forget correctness — PASS

- `emitUsageLog` is `async`, entire body inside try/catch — no path to propagate
- Both call sites: `void emitUsageLog(...)` in `chat()` and `chatStream()` — confirmed at `chat.ts`
- Catch logs `[llm_calls insert failed]` — tagged, grep-able
- Dynamic import of `@/db` and `@/db/schema` inside the function body — correct isolation; LLM module works without a live DB in test contexts

### 2. Contract preservation — PASS

- `UsageLogEntry` required fields unchanged: `deployment, prompt_tokens, completion_tokens, total_tokens, latency_ms, request_id`
- Three new optional FK fields: `article_id?, post_id?, prompt_id?` — additive only; all existing callers pass zero optional args
- `chatJSON` path uses `chat()` internally — inherits insert automatically, no third call site needed

### 3. Schema mapping — PASS

Full `llm_calls` NOT NULL column audit:

| Column | NOT NULL | Default | Mapped in INSERT |
|---|---|---|---|
| `id` | yes | uuid auto | n/a — DB generates |
| `model` | yes | none | `entry.deployment` |
| `prompt_tokens` | yes | 0 | `entry.prompt_tokens` |
| `completion_tokens` | yes | 0 | `entry.completion_tokens` |
| `total_tokens` | yes | 0 | `entry.total_tokens` |
| `success` | yes | true | not mapped — DB fills `true` |
| `created_at` | yes | now() | not mapped — DB fills |
| `duration_ms` | nullable | — | `entry.latency_ms` (always populated) |

All NOT NULL columns are either mapped or covered by DB defaults. Types: integer/number, varchar/string, uuid FKs — all match.

Note: `success` is always `true` because `emitUsageLog` is only called after successful LLM API calls. Failed calls throw before reaching `emitUsageLog`, so no failure rows are ever logged. The column is misleading in this design — relevant context for WI-17 dashboard work.

Note: `promptType` column exists in schema (nullable) but is not mapped. Correct — no prompt type context is available at the LLM call layer.

### 4. request_id handling — LOW NOTE

`request_id` is accepted in `UsageLogEntry` and populated at both call sites (`response.id ?? null`), but intentionally dropped in the INSERT (no `request_id` column in `llm_calls` schema). The PR description acknowledges this. However, **there is no in-code comment inside `emitUsageLog`** explaining the omission — the review spec explicitly requires it.

Recommended fix before merge:
```typescript
// request_id: intentionally omitted — no column in llm_calls schema; store in follow-up WI if needed
```

### 5. Query helpers — PASS

- `getUsageInRange(start, end)`: uses `gte`/`lte` — inclusive bounds on both ends, documented in JSDoc comment
- `getTotalTokensInRange(start, end)`: uses `sum()` for token aggregates (correct), `count()` for call count (correct)
- Empty result set: `?? 0` null-coalescing on all aggregates — handles zero-row case safely
- Drizzle type casting: `Number(row?.prompt ?? 0)` — `sum()` returns string in Drizzle/Postgres; cast is correct

### 6. Smoke test isolation — INFO

The smoke test creates its own `drizzle(sql, { schema: { llmCalls } })` instance for INSERTs, but then calls `getUsageInRange` and `getTotalTokensInRange` which use the module-level `db` singleton from `@/db`. These are two separate database connections hitting the same Postgres instance — works in practice since both connections see committed data.

Potential issue: if an assertion throws before the cleanup `await db.delete(llmCalls).where(eq(llmCalls.id, inserted.id))`, the test row leaks in the DB. Acceptable for a connectivity smoke test but worth noting for when a proper test framework is introduced (WI-testing-framework).

---

## Issues Summary

| Severity | Location | Issue |
|---|---|---|
| LOW | `chat.ts` `emitUsageLog` body | No inline comment explaining `request_id` is intentionally dropped |
| INFO | `usage.smoke.ts` | Two separate DB connections; test row leaks on assertion failure |
| INFO | `llm_calls.success` column | Always `true` — `emitUsageLog` never logs failed calls; misleading column name for WI-17 |

---

## Decision

**APPROVED WITH NOTES.** The fire-and-forget implementation is correct and safe. Schema mapping is complete. The only ask before merge is the missing in-code `request_id` comment — a one-liner. The INFO notes are informational context for WI-17 (dashboard) and the future test framework work.

Note: `gh pr review 9 --approve` rejected — cannot approve own PR (GitHub API constraint). Review posted as comment at https://github.com/joseg-ai/social-media-agent/pull/9#issuecomment-4381326941
