# WI-20 E2E Pipeline Integration Test — Switch Decision

**Date:** 2026-05-07  
**Author:** Switch (builder)  
**PR:** squad/wi-20-e2e-pipeline-test  
**Status:** Open for review

---

## What was built

`tests/e2e/full-pipeline.test.ts` — a single vitest file with 3 test cases that drive the complete feed-poll → score → draft → schedule → publish pipeline against a real Postgres database.

---

## Mock boundary decisions

The key architectural question: what to mock, and at what layer?

### ✅ `rss-parser` — mocked at the module boundary

- **Why:** The RSS feed URL is external. We want deterministic fixture data.
- **Real code exercised:** `parseFeed()` (URL/author extraction, content hashing), `ingestFeed()` (dedup via `onConflictDoNothing`, feed source metadata update).
- **Alternative rejected:** Mocking `parseFeed` itself would bypass the real ingest logic.

### ✅ `@/lib/llm` (chat + chatJSON) — mocked at the public API boundary

- **Why:** Azure OpenAI is a paid external service. `chatJSON` is the correct mock point because it is the function that scoring imports, and `chat` is what drafting imports. The real prompt render + Zod validation paths are exercised (the rendered prompt is passed to the mock, which just ignores it and returns the fixture).
- **Real code exercised:** `renderPrompt`, prompt template substitution, `llmResponseSchema` Zod parse (the mock returns a pre-validated object, but the real scoring logic normalizes and thresholds it), `sanitizeBody`, character limit enforcement.
- **Alternative rejected:** Mocking at the `getLLMClient` level would still require Azure credentials and network access.

### ✅ `fetch` — stubbed globally per-test for LinkedIn UGC Posts endpoint

- **Why:** `postToLinkedIn` → `callUgcPostsApi` is where the external HTTP call happens. By stubbing `fetch` we exercise the full production code path including error handling (422 → `LinkedInPostError` → `markFailed`).
- **Real code exercised:** `postToLinkedIn`, `getPersonUrn` (DB cache hit path), `callUgcPostsApi` response parsing, `markPosted` / `markFailed` state machine transitions.
- **Alternative rejected:** Mocking `postToLinkedIn` directly would bypass the error-handling wiring in `publisher.ts`.

### ✅ `@/lib/linkedin/tokens.getValidAccessToken` — mocked

- **Why:** The real function reads AES-256-GCM encrypted tokens from DB and requires `LINKEDIN_TOKEN_ENCRYPTION_KEY`. Avoiding that env var in tests keeps the E2E test runnable without the full production secret set.
- **Impact:** One real function is bypassed. The DB read in `getPersonUrn` (separate from token decryption) still uses the real oauth_tokens row we seed, so the person URN cache path is exercised.

### ✅ `@/lib/timing/advisor.decidePostingAction` — mocked to return `post_now`

- **Why:** The timing advisor's output is time-dependent (it reads the clock and DB for gap/window logic). Mocking it to return `post_now` makes `scheduledFor = ~now`, ensuring `claimReadyPosts({ now: new Date() })` can claim the post immediately. This keeps the test deterministic.
- **Real code exercised:** `scheduleDraft` (calls `approveDraft`), `approveDraft` (draft→scheduled state transition), full state machine for subsequent transitions.
- **Alternative considered:** Setting `posting_windows` to always-open and zero `min_gap_hours`. This would still hit the preflight path but the "all clear" case calls the LLM anyway (preflight returns null). Mocking the entire `decidePostingAction` is cleaner.

---

## Skip-on-no-DB approach

`describe.skipIf(!DATABASE_URL)` at the suite level + a `console.warn` on module load.

- Exit code is 0 when skipped — CI remains green without DB
- 3 tests show as "skipped" in vitest output (visible in report)
- Message explicitly shows the DATABASE_URL example command

---

## Schema management

- `beforeAll`: dedicated single-connection admin client drops `public` schema, recreates it, runs all Drizzle migrations via `drizzle-orm/postgres-js/migrator`.
- `afterEach`: `TRUNCATE ... CASCADE` on all application tables — complete isolation between tests without re-running migrations.

---

## Fixture data

- 2 articles from mock rss-parser: article 1 (Azure AI Foundry, score 80 → selected), article 2 (npm patch, score 50 → rejected)
- LLM mocks configured via `mockResolvedValueOnce` chains, reset in `afterEach` via `vi.clearAllMocks()`
- OAuth tokens row pre-seeded with `linkedinPersonUrn` cached (skips userinfo API call)

---

## Reviewer focus areas

1. **Mock layer correctness** — are we mocking too high (bypassing real logic) or too low (brittle against internal refactors)?
2. **`skipIf` UX** — does the skip message give enough context to a new contributor?
3. **Cleanup completeness** — does `afterEach` TRUNCATE cover all tables? Are there FK cascade concerns?
4. **Negative test coverage** — are the 422 and below-threshold scenarios covering the right assertions (no orphan rows, correct state)?
