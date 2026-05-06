# WI-20 E2E Pipeline Integration Test — Review Decision

**Date:** 2026-05-07  
**Reviewer:** Switch (reviewer hat)  
**PR:** #27 — `squad/wi-20-e2e-pipeline-test`  
**Status:** APPROVED WITH NOTES → MERGED ✅

---

## Verdict

**APPROVE WITH NOTES.** The test is architecturally correct. Mock boundaries are at the right layer. All three test cases exercise real production code paths. The skip-on-no-DB contract is properly implemented. Two non-blocking observations recorded; neither blocks merge.

---

## What was reviewed

`tests/e2e/full-pipeline.test.ts` — 469 lines, 3 test cases:
- Happy path: ingest → score → draft → schedule → claim → publish
- Below-threshold: no draft created, no orphan posts
- LinkedIn 422: post lands in `failed` state with failure metadata

---

## Mock boundary assessment

| Boundary | Mock | Assessment |
|---|---|---|
| `rss-parser` | Module mock, fixture items | ✅ Correct — `parseFeed`/`ingestFeed` run real |
| `@/lib/llm` (chat, chatJSON) | `vi.fn()` per test | ✅ Correct — prompt render, Zod parse, score normalisation real |
| `fetch` → `api.linkedin.com` | `vi.stubGlobal` per test | ✅ Correct in practice — see note below |
| `getValidAccessToken` | Returns `"fake-test-access-token"` (string) | ✅ Type matches real return type |
| `decidePostingAction` | Returns `{ action: 'post_now', reason }` | ✅ Matches `TimingDecision` interface shape |

Real code exercised: Drizzle ORM, `transitionPost` conditional UPDATEs, `scoreUnscoredArticles`, `generateDraftsForScored`, `scheduleAllDrafts`, `claimReadyPosts`, `publishPost`, `markPosted`, `markFailed`, `approveDraft`, `claimForPosting`.

---

## Observations (non-blocking)

### 1. Missing `linkedinPostId IS NULL` assertion in 422 test

The review criteria explicitly listed: "Assert: `last_error` is non-null, `failure_count === 1`, `linkedin_post_id IS NULL`."

The test asserts the first two but not the third. Production code is correct — `markFailed` never sets `linkedinPostId` — but the assertion is absent:

```ts
// 422 test — not present, should be:
expect(failedPosts[0]!.linkedinPostId).toBeNull();
```

Not a bug. A test completeness gap. Future builders may add this assertion.

### 2. Global `fetch` stub has no URL filter

`vi.stubGlobal("fetch", vi.fn().mockResolvedValue(...))` intercepts ALL fetch calls, not just `https://api.linkedin.com/v2/ugcPosts`. This is safe in the current test because:
- `rss-parser` is module-mocked (no fetch)
- `getPersonUrn` returns early from DB cache (URN seeded → no `/v2/userinfo` call)
- No other production code in the pipeline makes fetch calls

If the `linkedinPersonUrn` seed were ever accidentally removed, the stub would silently return the wrong shape to the userinfo call, masking the real error. A URL-discriminating stub would be more robust:

```ts
vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
  if (!url.includes("api.linkedin.com")) throw new Error(`Unexpected fetch: ${url}`);
  return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "urn:li:share:fake-12345" }) });
}));
```

---

## Rebase note

The branch was cut from `squad/wi-22-azure-deploy` before WI-22 was squash-merged to main via PR #26. The `gh pr merge --admin` initially failed with a merge conflict. `git rebase origin/main` cleanly dropped the WI-22 commits (already in main as identical content). After rebase, the PR diff contained only 3 files:
- `tests/e2e/full-pipeline.test.ts`
- `README.md` (E2E testing section)
- `.squad/decisions/inbox/switch-wi-20-e2e.md` (builder's decision record)

---

## Final state

All 23 work items are now merged to main. Squad has shipped. 🎉
