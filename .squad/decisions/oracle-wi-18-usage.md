# Decision: WI-18 — emitUsageLog implementation strategy

**Date:** 2026-05-05
**Author:** Oracle
**Status:** Implemented

## Context

WI-03 shipped `emitUsageLog({ deployment, prompt_tokens, completion_tokens, total_tokens, latency_ms, request_id })` as a frozen contract (console.log stub). WI-18 replaces the body with a DB INSERT into `llm_calls`.

## Decisions

### 1. Fire-and-forget via `void` + try/catch
Usage logging must never crash an LLM call. `emitUsageLog` is now `async` and called with `void` at both call sites (`chat` and `chatStream`). Any DB error is caught and logged via `console.error("[llm_calls insert failed]", err)` — never re-thrown.

### 2. Contract fields → column mapping
| Contract field | llm_calls column | Notes |
|---|---|---|
| `deployment` | `model` | Column name reflects the model concept, not Azure-specific term |
| `prompt_tokens` | `promptTokens` (Drizzle) | Direct mapping |
| `completion_tokens` | `completionTokens` | Direct mapping |
| `total_tokens` | `totalTokens` | Direct mapping |
| `latency_ms` | `durationMs` | Column name is more generic |
| `request_id` | (dropped) | No `requestId` column in schema — omitted |

### 3. Optional FK extension (backward-compatible)
`UsageLogEntry` now accepts optional `article_id`, `post_id`, `prompt_id`. Future agent callers (WI-07 scoring, WI-09 drafting) can pass these for full traceability. Existing callers are unaffected.

### 4. Dynamic import of `@/db` inside `emitUsageLog`
Using `await import("@/db")` avoids a circular-import risk and keeps the DB dependency lazy — the LLM module can be used in test contexts without a DB connection.

### 5. `request_id` not stored
The `llm_calls` schema (WI-02) has no `requestId` column. Rather than altering the schema (out of scope), `request_id` is accepted in the contract but silently discarded. A future WI can add the column if needed.
