# Switch Review Decision — PR #15 WI-07 Relevance Scorer

**Date:** 2026-05-05  
**PR:** https://github.com/joseg-ai/social-media-agent/pull/15  
**Author:** Oracle  
**Reviewer:** Switch  
**Verdict:** APPROVED WITH NOTES

---

## Blocker: Rebase required before merge

PR #12 (WI-09 draft generator) merged into `main` while this PR was open. WI-09 included WI-07's migration (`0001_article_status.sql`) and schema changes (`articleStatusEnum`, `articles.status`) as a dependency. The WI-07 branch forked from before WI-06 merged, so merging to current `main` produces conflicts in:

- `src/db/schema.ts` — enum comment wording and index ordering differ
- `src/db/migrations/0001_article_status.sql` — whitespace difference in header

**Oracle must rebase `squad/wi-07-relevance-scorer` on current `main`.** After rebase the duplicate migration and schema block will disappear from the diff (already exists in main). The net diff will be clean: only `src/lib/scoring/`, `src/lib/env.ts` RELEVANCE_THRESHOLD, and docs.

---

## WI-07 code is correct ✅

### Schema migration (`src/db/migrations/0001_article_status.sql`)
- `CREATE TYPE "public"."article_status" AS ENUM('new', 'scored', 'rejected', 'selected')` — four valid lifecycle states
- `ALTER TABLE "articles" ADD COLUMN "status" "article_status" DEFAULT 'new' NOT NULL` — existing rows get `'new'`, semantically correct (not yet scored)
- Index on `status` — appropriate for the `WHERE status='new'` query pattern
- ✅ Safe, backward-compatible

### JSON parse robustness
- `chatJSON` uses Zod `safeParse` and throws `AppError` on validation failure
- `scoreArticle` wraps in try/catch and re-throws with article ID context
- `scoreUnscoredArticles` wraps per-article — one failure increments `failed`, batch continues
- ✅ Bad LLM output → `failed` count, no batch abort

### Threshold defaults
- `RELEVANCE_THRESHOLD: z.coerce.number().min(0).max(100).default(70)` in `env.ts`
- ✅ Env-overridable, range-validated, default 70 is sensible

### Batch failure isolation
- ✅ Per-article try/catch in `scoreUnscoredArticles`

### Idempotency
- `scoreArticle` uses UPDATE (not INSERT) — safe to call twice
- Batch filters `status='new'` — already-processed articles skipped
- ✅ Correct

### Token usage
- `chatJSON → chat → emitUsageLog` — WI-18 compatible
- ✅ No direct `chat()` calls, flows through the standard path

### Prompt rendering
- `getActivePrompt('relevance_scorer', 'scoring')` + `renderPrompt` with `{{var}}` syntax
- All 5 template vars provided: `master_context`, `article_title`, `article_summary`, `article_url`, `feed_name`
- `master_context` falls back to `""` with `console.warn` if missing from settings
- ✅ Correct; `PromptRenderError` thrown on missing vars

### Lint + Build
- `npm run lint` — exit 0 ✅
- `npm run build` — exit 0 ✅ (Turbopack, type check passes)

---

## Minor notes (non-blocking)

1. **`normaliseScore(1)` ambiguity:** Integer `1` is treated as fractional (1 × 100 = 100). If a future 0–100 prompt returns `1` it would be scored as 100%. Documented and acceptable for v1, revisit when deprecating fractional prompts.

2. **No status guard on direct `scoreArticle` calls:** Calling on a `selected` article downgrades it to `scored`/`rejected`. The batch is safe (status filter). Direct callers should be aware. Consider adding guard or JSDoc warning.

3. **`schemaDescription` inconsistency:** System message says `score: <number 0-100>` but v1 prompt returns 0–1. Low risk — normalisation handles both — but the system message and prompt are technically contradictory.

---

## Migration sequencing (coordinator note)

WI-09 merged first (correct). After Oracle rebases WI-07, the migration will no longer be in the diff — it's already in `main`. WI-07 merge will add only the scoring service. ✅ Sequencing resolved.
