# Decision: WI-04 RSS Parser — Library choice + error contract

**Date:** 2026-05-05
**Author:** Tank
**Branch:** squad/wi-04-rss-parser
**Status:** Adopted

## Context

WI-04 requires fetching and parsing both RSS 2.0 and Atom feeds from arbitrary URLs. Needed to pick a Node.js parsing library and define the error handling contract for the ingestion function.

## Decisions

### 1. Library: `rss-parser` (npm)

**Chosen:** `rss-parser` v3.x

**Rationale:**
- Ships its own TypeScript types (no separate `@types/*` needed)
- Handles both RSS 2.0 and Atom transparently
- De-facto community standard — ~2M weekly downloads, maintained
- Simple Promise-based API that wraps `xml2js` under the hood
- Supports custom `User-Agent` header and timeout configuration

**Rejected alternatives:**
- `feedparser` — stream-based API, more ceremony for our use case
- `fast-xml-parser` + manual field mapping — more control but more code
- Rolling our own XML parser — unnecessary complexity for commodity work

### 2. Error contract for `ingestFeed`

| Error type | Treatment | Rationale |
|------------|-----------|-----------|
| Network failure (DNS, timeout, 4xx/5xx) | Caught; `last_error_message` set; `consecutive_fail_count` incremented; returns `{0,0}` | Caller (job loop in WI-06) should not crash on bad feeds |
| Malformed XML / unparseable feed | Same as network failure | Data errors are not programmer errors |
| Feed source not found in DB | **Throws** | Programming error — callers should validate IDs before passing |
| DB write errors (insert, update) | **Throws** | Programmer errors; Postgres constraint violations other than URL uniqueness indicate schema or code bugs |

### 3. Deduplication strategy

Relying on the globally-unique constraint on `articles.url` (schema from WI-02, PR #6). Using Drizzle's `.onConflictDoNothing()` + `.returning()` to count actual inserts vs skips without a separate SELECT per article. This is a single bulk insert per ingest run — O(1) round-trips to the DB regardless of feed size.

### 4. `contentHash` computation

SHA-256 of `title + summary` text (empty string if summary is null). This matches the comment in `src/db/schema.ts` and provides the belt-and-suspenders dedup for WI-06's content-hash dedup path.

## What's NOT in scope (deferred to WI-06)

- Cron scheduling / interval configuration
- Postgres advisory locks for leader election
- Retry-with-backoff logic
- Batch polling of all enabled feeds
