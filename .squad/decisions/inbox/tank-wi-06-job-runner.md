# Decision Note: WI-06 Job Runner

**Author:** Tank  
**Date:** 2026-05-05  
**Branch:** squad/wi-06-job-runner  
**PR:** https://github.com/joseg-ai/social-media-agent/pull/14

## What was built

A cron-based job runner with Postgres advisory lock leader election, wrapping
the existing `ingestFeed()` from WI-04.

## Key decisions

### 1. Reserved connection for advisory locks

`pg_try_advisory_lock` and `pg_advisory_unlock` **must** run on the same
Postgres session. In a connection pool, consecutive queries can land on
different connections. Used `db.$client.reserve()` (postgres-js API) to pin
both calls to one connection for the duration of the lock lifecycle.

Alternative considered: `pg_try_advisory_xact_lock` inside a transaction
(auto-releases on commit/rollback). Rejected because the spec explicitly
requires session-level locks with explicit unlock in `finally` — this gives
callers more control and makes the lock lifetime independent of transaction
boundaries.

### 2. Lock key derivation

SHA-256 of the job name string, first 15 hex chars → 60-bit unsigned integer
→ `BigInt`. Fits safely in Postgres `int8` (signed 64-bit, max positive
~4.6e18). 60-bit key space has negligible collision risk for O(10) jobs.

### 3. Error isolation strategy

Two catch layers:
1. **Per-feed** (`feed-poll.ts`): catches errors from individual `ingestFeed()`
   calls — one broken feed continues the loop
2. **Per-run** (`runner.ts` cron callback): catches advisory lock infrastructure
   errors — DB-down doesn't crash the node-cron scheduler

`ingestFeed()` itself also catches network/parse errors internally (per WI-04
contract), so feed-level errors are triple-wrapped. DB errors from `ingestFeed`
still propagate to the per-feed catch in `feed-poll.ts` where they're logged.

### 4. Graceful shutdown

`stopJobs()` calls node-cron's `task.stop()` which prevents future ticks.
It does NOT await in-flight runs. Acceptable for v1 because:
- `ingestFeed()` uses Drizzle transactions (atomic) — a mid-run exit leaves
  no partial state
- Feed ingestion is idempotent (dedup by URL constraint)

A drain mechanism (wait for in-flight runs before exit) is deferred to when
we have non-idempotent jobs (e.g. LinkedIn posting via WI-12).

### 5. Configurable schedule

`FEED_POLL_CRON` env var with default `*/15 * * * *`. Documented in
`.env.example`. Not added to the Zod env schema because it has a hardcoded
fallback and doesn't need validation — `node-cron` validates the expression
at `defineJob()` time and throws immediately if invalid.

## Scope intentionally excluded

- Post-publisher job (WI-11/WI-12)
- Retry/backoff for failed feeds (deduped to WI-06 retry section; `ingestFeed`
  already tracks `consecutive_fail_count` — retry scheduling is future work)
- Instrumentation hook (`instrumentation.ts`) integration — the standalone
  `scripts/run-jobs.ts` is sufficient for v1 and avoids Next.js server coupling
