# Switch Review — PR #10 (WI-04: RSS Parser + Ingestion)

- **PR:** https://github.com/joseg-ai/social-media-agent/pull/10
- **Branch:** `squad/wi-04-rss-parser`
- **Author:** Tank
- **Reviewer:** Switch
- **Date:** 2026-05-05
- **Verdict:** ✅ APPROVED WITH NOTES (non-blocking)

---

## Checklist Results

### 1. Error Handling Discipline ✅

| Check | Result |
|---|---|
| Network/parse errors caught, returns `{0,0}` | ✅ `parseFeed` wrapped in try/catch; `lastErrorMessage` + `consecutiveFailCount` updated; no exception leaks |
| DB errors rethrow | ✅ No try/catch around DB calls — they propagate naturally as programmer errors |
| `last_error_message` cleared on success | ✅ Step 4 update explicitly sets `lastErrorMessage: null` |

All three checks pass. Error contract is clean and consistent with the documented design.

---

### 2. Dedupe Correctness ✅ (with INFO note)

- **Unique constraint exists:** `articles.url` has `.unique()` at `schema.ts:81` — globally unique, not per-feed. Correct.
- **`onConflictDoNothing().returning()`:** Valid pattern. Rows blocked by the URL constraint are not returned, giving exact inserted/skipped counts. ✅
- **`contentHash` (SHA-256 of title+summary):** Used for the composite `unique("articles_url_content_hash_uq").on(t.url, t.contentHash)` at `schema.ts:102`.

**INFO — Composite constraint is effectively dead code:**
The composite `(url, content_hash)` unique is strictly weaker than the `url`-only unique already present. If `url` is unique globally, no two rows can share the same URL regardless of hash. The composite constraint can never block a row that the `url` constraint doesn't already block. The schema comment calls it "belt-and-suspenders" but it provides zero additional protection. Not harmful, and not in scope of this PR (it's a WI-02 schema artefact) — flagged for awareness only.

---

### 3. Input Safety ⚠️ LOW (non-blocking)

**URL scheme validation — missing in `parseFeed()`:**
```typescript
// parser.ts — no scheme check before this call
const feed = await parser.parseURL(url);
```
`rss-parser` calls axios internally and will follow any scheme axios supports. A `feed_sources` row with `url = "file:///etc/passwd"` would be passed through directly.

**Mitigating factors:**
- `feed_sources.url` requires a DB write — only an admin/privileged agent can insert rows. Untrusted users have no path here today.
- This is SSRF-class, not an injection risk.

**Recommendation (non-blocking):** Add a scheme guard at the top of `parseFeed`:
```typescript
const parsed = new URL(url);
if (!["http:", "https:"].includes(parsed.protocol)) {
  throw new Error(`Unsupported feed URL scheme: ${parsed.protocol}`);
}
```
This is defense-in-depth and costs two lines. Suggest picking it up as a follow-on in WI-06 or as a standalone micro-fix.

**Timeout:** ✅ `timeout: 15_000` (15 seconds) set at parser construction.

**Max feed size:** `rss-parser` does not expose a `maxByteLength` option. Low risk for admin-controlled URLs; acknowledged in Tank's design notes.

---

### 4. Schema Mapping ✅

All NOT NULL columns are populated:

| Column | Source | Status |
|---|---|---|
| `id` | `uuid().defaultRandom()` | ✅ auto |
| `feed_source_id` | `feedSourceId` param | ✅ |
| `title` | `item.title ?? "(untitled)"` | ✅ never null |
| `url` | `item.link ?? item.guid` (empty filtered out) | ✅ |
| `content_hash` | SHA-256 via `hashContent()` | ✅ |
| `created_at` | `defaultNow()` | ✅ auto |

Nullable columns (`summary`, `published_at`, `author`, `raw_metadata`) correctly accept null. No spurious `status` field (correct — state machine lives on `posts`).

---

### 5. Minor — `consecutiveFailCount` Race ⚠️ LOW

```typescript
consecutiveFailCount: source.consecutiveFailCount + 1,
```
This is a read-modify-write in application code. Two concurrent ingests of the same source could both read `N` and write `N+1` instead of `N+2`. Fine for now since WI-06 will add Postgres advisory locks. No action required this PR.

---

### 6. Build / Lint ✅

Tank reports `npm run lint → exit 0` and TypeScript compiled cleanly. The Turbopack build failure is pre-existing (missing env vars in CI), unrelated to this PR. Scoped files are all within `src/lib/feeds/` and `.squad/` — no out-of-scope touches.

---

## Summary

| Area | Result |
|---|---|
| Error handling | ✅ Clean |
| Dedupe / unique constraint | ✅ Correct (composite UQ is dead code — INFO only) |
| URL scheme validation | ⚠️ LOW — missing, mitigated by admin-only DB access |
| consecutiveFailCount race | ⚠️ LOW — read-modify-write, WI-06 advisory locks will cover |
| Schema mapping | ✅ All NOT NULL columns covered |
| Build / lint | ✅ |

**No blocking issues. Approved.**
