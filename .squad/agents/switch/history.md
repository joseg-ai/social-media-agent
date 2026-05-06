# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent ΓÇö agentic LinkedIn auto-poster pulling from Microsoft RSS + learn.microsoft.com with smart timing.
- **Stack:** Next.js 15, React 19, TypeScript, Tailwind 4. **Test framework: vitest 3.2.4** (added WI-21).
- **Created:** 2026-05-04

## Learnings

### 2026-05-06 — WI-21 NBSP snapshot tests PR #22 reviewed → APPROVED

- **Status:** APPROVED. Merged via squash.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/22
- **What was verified:**
  - `sanitizeBody()` actually preserves U+00A0 — the zero-width strip regex covers `[\u200B-\u200D\uFEFF\u00AD]`, not U+00A0. Contract is real, not aspirational.
  - All 15 tests target `sanitizeBody()` directly (pure function); mocks only prevent import-time DB/LLM singletons from crashing — no LLM passthrough.
  - Inline snapshots are NBSP-specific and narrow; `withExplicitNbsp()` makes U+00A0 unambiguous in snapshot literals.
  - Negative test (suite 5) confirms `\n\n` is NOT upgraded — sanitizer preserves, doesn't inject.
  - `vitest.config.ts`: `environment: node`, `SKIP_ENV_VALIDATION: "1"` in env block, path aliases mirror tsconfig.
  - No pre-existing `test` script on main — clean addition, no conflict.
  - `npm test` exits 0 on two consecutive runs (no snapshot drift).
  - Build failure (`linkedinPersonUrn` type error in `poster.ts`) is pre-existing on `main`, not introduced here.
  - Lock file included; no production code modified.
- **Observation:** `@vitest/snapshot` listed as explicit devDep — vitest already pulls it transitively. Harmless but redundant.
- **Decision file:** `.squad/decisions/inbox/switch-pr-22-wi-21.md`

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` ΓÇö you own testing (NBSP-spacing snapshot tests, draft rendering validation)
- **IDs you own:** Observability wave (test framework selection, posting flow tests, NBSP rendering validation snapshot tests)
- **Reference:** .squad/decisions/decisions.md contains master prompt with NBSP requirements and all resolved decisions (Q1-Q9)

### 2026-05-05 ΓÇö WI-01 Foundation PR #3 reviewed ΓåÆ APPROVED
- **Status:** APPROVED. Tank's WI-01 foundation passes all acceptance criteria.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/3
- **What was verified:** 5 module dirs + placeholders, tsconfig path aliases (`tsc --noEmit` clean), `.env.example` with all 11 required vars, `env.ts` fail-fast confirmed by runtime test (throws listing all missing fields, no value leakage), docker-compose postgres:16 + named volume matches DATABASE_URL hint, drizzle.config.ts placeholder correct, lint clean, build clean (Turbopack), 15 changed files all in scope.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own PR). Review comment posted instead; verdict recorded in `.squad/decisions/inbox/switch-pr-3-review.md`.

### 2026-05-05 ΓÇö WI-19 LinkedIn OAuth PR #7 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Crypto core correct (fresh IV, authTag verified, timingSafeEqual). Key finding: `iv`/`authTag` columns are NOT "unused by design" ΓÇö `storeTokenResponse` actively writes them (redundant + asymmetric, not a security issue). Follow-ups: stop writing redundant columns, add key-length `.refine()` in env.ts.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/7
- **Decision file:** `.squad/decisions/inbox/switch-pr-7-review.md`

## Learnings

### 2026-05-05 ΓÇö WI-10 Prompt Management PR #8 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's WI-10 prompt service is solid for single-user operation.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/8
- **What was verified:** Transaction wrapping on activate-swap (both `createPromptVersion` and `activatePromptVersion` use `db.transaction()`), render correctness (`PromptRenderError` thrown on missing vars, extras silently ignored, whitespace preserved), seed idempotency (checks `isActive=true` before insert), API surface alignment with WI-07/08/09 (composite key, typed errors, all public types exported), schema alignment with `prompts` table in `schema.ts`.
- **Issues found:**
  - MEDIUM (`index.ts:180`): `listPromptHistory` called outside transaction ΓÇö version number race under concurrent writes. No unique constraint on `(name, promptType, version)` to catch it. Fix before WI-16 multi-user dashboard.
  - LOW (`seed.ts:191`): Seed idempotency check uses `isActive=true` only; deactivated-then-re-seed creates duplicate v1.
  - INFO (`smoke.ts`): Smoke test reimplements service logic inline, doesn't call production functions.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own-org PR). Review comment posted instead.
- **Decision file:** `.squad/decisions/inbox/switch-pr-8-review.md`
### 2026-05-05 ΓÇö WI-18 PR #9 reviewed -> APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's token usage persistence layer passes all acceptance criteria.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/9
- **What was verified:** Fire-and-forget try/catch wraps entire `emitUsageLog` body; both call sites use `void`; `[llm_calls insert failed]` tag confirmed. All `UsageLogEntry` required fields preserved; new optional FK fields are additive. Schema NOT NULL column audit complete ΓÇö all covered by mapping or DB defaults. `getTotalTokensInRange` uses `sum()` not `count()` for tokens. Inclusive bounds documented in JSDoc.
- **Issues flagged:** LOW ΓÇö missing inline comment in `emitUsageLog` body explaining `request_id` is intentionally dropped (no schema column). INFO ΓÇö smoke test uses two separate DB connections; test row leaks on assertion failure. INFO ΓÇö `llm_calls.success` column always `true` (misleading name, design-level note for WI-17).
- **API limitation:** `gh pr review --approve` rejected (cannot approve own PR). Review comment posted instead; verdict recorded in `.squad/decisions/inbox/switch-pr-9-review.md`.

### 2026-05-05 ΓÇö WI-04 RSS Parser + Ingestion PR #10 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Tank's WI-04 RSS parser + ingestion is solid.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/10
- **What was verified:** Error contract (network errors caught/returns `{0,0}`, DB errors rethrow, `lastErrorMessage: null` cleared on success Γ£à), dedupe via `articles.url` unique constraint (exists at `schema.ts:81`) + `onConflictDoNothing().returning()` count correctness Γ£à, 15s timeout Γ£à, all NOT NULL columns populated Γ£à, build/lint clean Γ£à.
- **Issues found:**
  - LOW (`parser.ts`): No URL scheme validation before `parseFeed()` ΓÇö SSRF-class risk (file://, gopher://). Mitigated by `feed_sources` being admin-only DB access. Recommend adding scheme guard in WI-06 or micro-fix.
  - LOW (`ingest.ts`): `consecutiveFailCount` increment is read-modify-write in app code ΓÇö race under concurrent ingests. Covered by WI-06 advisory locks.
  - INFO (`schema.ts` ΓÇö WI-02 artefact): Composite `unique(url, content_hash)` is dead code since `url` alone is already globally unique. Not harmful, not in scope.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own-org PR). Review comment posted instead.
- **Decision file:** `.squad/decisions/inbox/switch-pr-10-review.md`

### 2026-05-05 ΓÇö WI-09 Draft Generator PR #12 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's WI-09 draft generator is functionally correct for single-user MVP.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/12
- **What was verified:** sanitizeBody unit-tested (null bytes, ZWJ, bold, italic, headings, NBSP preserved Γ£à), char-limit spread `[...body]` counts code points not UTF-16 units Γ£à, 2999+1=3000 boundary correct Γ£à, state='draft' hard-coded Γ£à, article set to 'selected' after success Γ£à, chat() emitUsageLog path not bypassed Γ£à, batch try/catch per article Γ£à, lint clean Γ£à, build clean Γ£à.
- **Schema migration:** `0001_article_status.sql` adds `article_status` ENUM + `articles.status DEFAULT 'new' NOT NULL` ΓÇö backwards-compatible with existing rows Γ£à. Not idempotent (no `IF NOT EXISTS`), acceptable for drizzle-managed workflow.
- **Issues found:**
  - MEDIUM (`schema.ts`, posts table): Missing `unique()` on `posts.article_id` ΓÇö TOCTOU race window between SELECT-check and INSERT. No DB-level guard against duplicate posts per article. Recommend adding in WI-11 when Tank touches the posts table.
  - MEDIUM (`generator.ts:231-245`): No transaction wrapping post INSERT + article status UPDATE. Crash between the two leaves article permanently at `status='scored'` with an orphaned post. Fix: `db.transaction()` around both statements.
  - INFO (`generator.ts:203`): `chat()` called before post INSERT, so `llm_calls.postId` is always NULL for draft calls. FK exists but unused for this case.
- **Decision file:** `.squad/decisions/inbox/switch-pr-12-wi-09.md`

### 2026-05-05 ΓÇö WI-07 Relevance Scorer PR #15 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES (rebase required before merge).
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/15
- **What was verified:** Schema migration (`NOT NULL DEFAULT 'new'` correct for existing rows Γ£à), JSON parse robustness (`chatJSON` safeParse ΓåÆ `AppError` throw ΓåÆ per-article catch in batch ΓåÆ `failed++` Γ£à), threshold default (`RELEVANCE_THRESHOLD: z.coerce.number().default(70)` in env.ts Γ£à), batch failure isolation (per-article try/catch Γ£à), idempotency (UPDATE not INSERT, batch filters `status='new'` Γ£à), token usage (`chatJSONΓåÆchatΓåÆemitUsageLog` Γ£à), prompt rendering (`getActivePrompt + renderPrompt + master_context fallback Γ£à), lint + build clean Γ£à.
- **Blocker found:** PR #12 (WI-09) merged into `main` before this PR. WI-09 included WI-07's `0001_article_status.sql` and `schema.ts` changes as a dependency. Merging WI-07's branch to current `main` will conflict on schema.ts (enum comment wording, index ordering) and the migration file (whitespace). **Oracle must rebase on main** ΓÇö after rebase, the duplicate files vanish from the diff; only `src/lib/scoring/`, env.ts RELEVANCE_THRESHOLD remain.
- **Minor notes:** `normaliseScore(1)` ambiguity for future integer prompts (documented, non-blocking), no status guard on direct `scoreArticle` calls (informational), `schemaDescription` system message says 0-100 while v1 prompt returns 0-1 (low risk).
- **Decision file:** `.squad/decisions/inbox/switch-pr-15-wi-07.md`
### 2026-05-06 ΓÇö WI-17 Token Usage Dashboard PR #18 reviewed ΓåÆ REJECTED
- **Status:** REJECTED. Two blockers; do not merge.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/18
- **What was verified:** Cross-territory scope clean (only `src/lib/llm/*`, `src/app/(dashboard)/usage/`, `src/app/api/usage/` ΓÇö no posts/feeds/drafts/scoring touched Γ£à), `listRecentCalls` adds new function without modifying existing signatures Γ£à, cost formula correct (`(tokens/1000)*rate`, no off-by-1000 Γ£à), auth covered by middleware Γ£à, `force-dynamic` present Γ£à, no charting deps Γ£à, lint exit 0 Γ£à.
- **Blockers:**
  - HIGH: `layout.tsx` is NOT on main. PR description claims "already on main via WI-15 PR" ΓÇö false; `git show origin/main:src/app/(dashboard)/layout.tsx` ΓåÆ fatal. PR #17 (WI-15) still open. Merge order: #17 first, then #18. No code change needed on this PR.
  - MEDIUM: `llm_calls.model` stores `env.AZURE_OPENAI_DEPLOYMENT` (Azure deployment name), not the OpenAI model identifier. Pricing table keys must match exactly. Silent fallback to `DEFAULT_PRICING` if deployment name differs (e.g. "prod-gpt4o" doesn't match "gpt-4o"). `DEFAULT_PRICING` description says "GPT-4o rates" but is a different value. Three Claude entries (`claude-sonnet-4.6`, `claude-haiku-4.5`, `claude-opus-4.5`) are dead code ΓÇö all calls route through Azure OpenAI.
- **Non-blocking:** `rangeToWindow` timezone undocumented (`setHours(0,0,0,0)` = server local time). `rangeToWindow`/`parseRange` duplicated verbatim in `route.ts` and `page.tsx`.
- **Decision file:** `.squad/decisions/inbox/switch-pr-18-wi-17.md`

### 2026-05-06 ΓÇö WI-11 Post State Machine PR #16 reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Tank's WI-11 state machine + scheduling integration is solid. Merged.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/16
- **What was verified:** Transition allowlist (9 pairs complete, matches diagram Γ£à), race condition safety (conditional UPDATE atomic ΓÇö traced 2-worker scenario, exactly 1 winner Γ£à), `claimReadyPosts` error handling (only `InvalidStateTransitionError` silently dropped, all others rethrown Γ£à), migration `0002` (additive only ΓÇö `failure_count NOT NULL DEFAULT 0`, `cancel_reason TEXT NULL`, posts table only Γ£à), `markPosted` idempotency (second call ΓåÆ clean `InvalidStateTransitionError` Γ£à), `scheduleDraft` all 3 advisor outcomes (`post_now`/`schedule_for`/`skip` Γ£à), error class exports (both `InvalidStateTransitionError` and `NotImplementedError` exported from state-machine + index Γ£à), lint exit 0 Γ£à, TypeScript clean in Tank's files (4 tsc errors all in Trinity's untracked WI-14/WI-17 files) Γ£à.
- **Issues found:**
  - MEDIUM (`state-machine.ts:180`): `cancelPost()` JSDoc says "any non-terminal state ΓåÆ cancelled" but `postingΓåÆcancelled` is **not** in `ALLOWED_TRANSITIONS`. Calling `cancelPost()` on a `posting` post throws `InvalidStateTransitionError` immediately. Trinity's WI-14 DELETE handler swallows all errors from `cancelPost()` and falls through to a raw DB update ΓÇö meaning a `posting` post gets force-cancelled bypassing the state machine. Docstring fix needed; transition logic itself is correct.
  - INFO: `approveDraft()` without `schedule_for` leaves `scheduledFor=null`; SQL `lte(scheduledFor, now)` treats null as not-past, so these posts sit in `scheduled` state forever, silently never claimed. Documented in JSDoc but a silent failure mode.
  - INFO: `scheduleDraft` is not idempotent ΓÇö second call throws `InvalidStateTransitionError`. Not a bug, just undocumented behavior.
- **Decision file:** `.squad/decisions/inbox/switch-pr-16-wi-11.md`

### 2026-05-06 ΓÇö WI-08 Timing Advisor PR #13 re-reviewed ΓåÆ APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Tank fixed the original blocker (scalar key mismatch).
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/13
- **Original blocker resolved:** `readPostingWindows()` reads canonical `'posting_windows'` JSONB key. No leftover scalar reads. Defaults aligned (`max_posts_per_day=1`, `min_gap_hours=20`). Γ£à
- **Midnight-wrap verified:** `isInsideWindow(hour, start, end)` ΓÇö all 5 mental tests pass. Scenarios I/J smoke-tested Γ£à.
- **Jitter applied:** Pre-flight `schedule_for` outputs all get `withJitter(target, ctx.jitter_minutes)`. LLM path Zod-validated. Γ£à
- **Days allowlist:** Weekday check (step 3) runs before hour window. `daysUntilNext` loop finds next allowed day. Scenario K (Sunday ΓåÆ Monday) Γ£à.
- **Lint + build:** Both exit 0 Γ£à.
- **Notes (non-blocking):**
  - N1: Jitter not applied to LLM-returned `schedule_for` (intentional? ΓÇö recommend JSDoc)
  - N2: JSONB cast without Zod parse ΓÇö wrong-type stored values degrade silently to `schedule_for`; fix in WI-23
  - N3: `daysUntilNext` exits at 8 if all days invalid (malformed data only)
- **Decision file:** `.squad/decisions/inbox/switch-pr-13-rereview.md`


### 2026-05-06 ΓÇö WI-17 Token Usage Dashboard PR #18 re-reviewed ΓåÆ APPROVED + MERGED
- **Status:** APPROVED. Both blockers from first review fully addressed. Rebase performed; squash-merged to main.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/18
- **Fixes verified:**
  1. **Layout blocker (HIGH):** PR #17 (WI-15) merged at `bd2be33`. `src/app/(dashboard)/layout.tsx` present on main. Rebased `squad/wi-17-usage-ui` onto `origin/main` ΓÇö clean, zero conflicts. `NAV_LINKS` in rebased layout.tsx: Feeds Γ£à + Usage Γ£à (both present; inherited from WI-15, WI-17 doesn't touch the file).
  2. **Pricing mismatch (MEDIUM):** `pricing.ts` revised in commit `c21c752`. JSDoc on `PRICING_USD_PER_1K_TOKENS` and `estimateCostUsd()` both document that `llm_calls.model` = `env.AZURE_OPENAI_DEPLOYMENT` (deployment slug, not canonical name) Γ£à. Three Claude entries removed Γ£à. `DEFAULT_PRICING` relabeled as "conservative fallback for unknown slugs" at `{ prompt: 0.005, completion: 0.015 }` ΓÇö higher than any named rate, intentionally errs toward over-reporting Γ£à.
- **Scope (post-rebase diff vs main):** `src/app/(dashboard)/usage/page.tsx`, `src/app/api/usage/route.ts`, `src/lib/llm/pricing.ts`, `src/lib/llm/usage.ts`, `src/lib/llm/index.ts`, `.squad/agents/trinity/history.md`. No foreign-agent files. Γ£à
- **Lint:** Exit 0 (pre-existing `_post` unused-var warning in `publisher.ts` ΓÇö not from this PR). Γ£à
- **Build (`SKIP_ENV_VALIDATION=1`):** `/usage` and `/api/usage` both appear as dynamic routes in manifest. 13/13 static pages. Clean. Γ£à
- **Side-effect note:** WI-14 (`squad/wi-14-queue-history-ui`) has its own layout.tsx diverged from main; Trinity-4 must rebase that branch onto main (now at `2a48398`) before its PR merges.
- **Decision file:** `.squad/decisions/inbox/switch-pr-18-wi-17-approved.md`

### 2026-05-06 ΓÇö WI-15 Feed Management UI PR #17 re-reviewed ΓåÆ APPROVED + MERGED
- **Status:** APPROVED. All 3 blockers from first review addressed. Squash-merged to main.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/17
- **Fixes verified:**
  1. `src/lib/posts/queries.ts` absent from diff. Γ£à
  2. `FeedRow.tsx handleToggle` ΓÇö `res.ok` check, `setToggleError` inline, `router.refresh()` on success only, try/catch for network errors, `finally` clears pending. Mirrors `handleDelete`. Γ£à
  3. `AddFeedForm.tsx` ΓÇö `new URL(url).hostname` inside try block; `finally { setLoading(false) }` covers all throw paths. Γ£à
- **Scope:** 8 files ΓÇö feeds/, layout.tsx, page.tsx (redirect). No foreign-agent territory. Γ£à
- **NAV_LINKS:** Single private const, `as const`. Merge-friendly. Γ£à
- **Lint/Build:** Lint exit 0. Compile + type-check + 12/12 static pages clean. Turbopack ENOENT pre-existing on main. Γ£à
- **Side-effect for PR #18:** `layout.tsx` now on main ΓÇö WI-17 layout.tsx blocker resolved; Oracle should rebase.
- **Decision file:** `.squad/decisions/inbox/switch-pr-17-wi-15.md`
### 2026-05-06 ΓÇö WI-14 Queue + History Dashboard PR #19 re-reviewed ΓåÆ APPROVED + MERGED
- **Status:** APPROVED. Both HIGH blockers from first review fully fixed. Rebase onto main clean (no conflicts). Squash-merged to main. Wave 4 batch-1 complete (WI-11, WI-15, WI-17, WI-14 all on main).
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/19
- **Fixes verified:**
  1. **Blocker 1 (approve route):** `src/app/api/posts/[id]/approve/route.ts` now imports `approveDraft, InvalidStateTransitionError` from `@/lib/posts`. Calls `await approveDraft(id)` ΓÇö no raw `db.update()`. Catches `InvalidStateTransitionError` ΓåÆ 409 with message "Post is not in draft state ΓÇö cannot approve". Does NOT pass `schedule_for`. TODO(WI-11) comment gone. Γ£à
  2. **Blocker 2 (DELETE route):** `src/app/api/posts/[id]/route.ts` imports `cancelPost, InvalidStateTransitionError`. Reads optional `reason` from body; validates `typeof raw !== "string"` (strict, not String coercion) + Γëñ500 chars. Calls `await cancelPost(id, reason)`. Catches `InvalidStateTransitionError` ΓåÆ 409 with descriptive message. TODO gone. Γ£à
  3. **PATCH handler (pre-existing, no change needed):** State guard `existing.state !== 'draft'` ΓåÆ 409 present at line 36. Γ£à
- **Scope (post-rebase diff vs main):** `src/app/(dashboard)/history/`, `src/app/(dashboard)/queue/`, `src/app/api/posts/`, `src/lib/posts/queries.ts`, `.squad/agents/trinity/history.md`. 10 files, no foreign-agent territory. Γ£à
- **Layout.tsx:** All 6 NAV_LINKS intact on main (Feeds, Queue, History, Prompts, Usage, Settings). Rebase clean. Γ£à
- **Lint:** Exit 0. Only pre-existing `_post` unused-var warning in `publisher.ts` (not from this PR). Γ£à
- **Build (`SKIP_ENV_VALIDATION=1`):** Exit 0. 18 routes including `/queue`, `/history`, `/api/posts/[id]/approve`. Γ£à

### 2026-05-06 ΓÇö WI-21 NBSP Spacing Snapshot Tests BUILT
- **Status:** BUILT. Snapshot tests written, all 15 pass, snapshot stable on second run.
- **Branch:** `squad/wi-21-nbsp-snapshots`
- **What was built:**
  - Installed `vitest` + `@vitest/snapshot` as devDependencies.
  - Created `vitest.config.ts` at project root with `SKIP_ENV_VALIDATION=1` env and `@/*` path alias resolution.
  - Created `src/lib/drafts/generator.snapshot.test.ts` ΓÇö 15 tests across 6 suites.
  - Added `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`.
  - Added testing note to `README.md`.
- **NBSP contract confirmed:** `sanitizeBody()` PRESERVES `\n\u00A0\n` (newline + NBSP + newline). It does NOT inject NBSP for bare `\n\n`. The LLM prompt is responsible for emitting NBSP; sanitizer is pass-through for U+00A0.
- **Decision file:** `.squad/decisions/inbox/switch-wi-21-nbsp-snapshots.md`

### 2026-05-06 ΓÇö WI-14 Queue + History Dashboard PR #19 reviewed ΓåÆ REJECTED
- **Status:** REJECTED. Two blockers; do not merge.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/19
- **What was verified:** 3-table join in `queries.ts` Γ£à, Drizzle params (no raw SQL injection) Γ£à, char count uses `[...text].length` Γ£à, no markdown rendering (uses `<pre>`) Γ£à, `force-dynamic` on both pages Γ£à, pagination offset correct Γ£à, layout.tsx inherited from main (already has all 6 links) Γ£à, cross-territory scope clean Γ£à, lint exit 0 Γ£à, build exit 0 (13 routes) Γ£à.
- **Blockers:**
  - HIGH (`src/app/api/posts/[id]/approve/route.ts`): `POST /api/posts/[id]/approve` uses raw `db.update()` instead of `approveDraft()` from state-machine.ts. WI-11 is on main; `TODO(WI-11)` fallback must be gone. Additionally, the raw UPDATE has no `AND state = 'draft'` in its WHERE clause ΓÇö two concurrent approvals can both succeed (non-atomic TOCTOU). `approveDraft()` uses a conditional UPDATE that prevents this. Also unconditionally sets `scheduledFor: new Date()`, bypassing the timing advisor.
  - HIGH (`src/app/api/posts/[id]/route.ts`): `DELETE /api/posts/[id]` uses raw `db.update()` with no state check. Can force-cancel a `posting` post (mid-flight LinkedIn submission). `cancelPost()` rejects `postingΓåÆcancelled` (not in ALLOWED_TRANSITIONS) ΓÇö that protection is intentional. Raw UPDATE bypasses it entirely: DB shows `cancelled` while LinkedIn may have successfully posted, leaving system inconsistent. Fix: call `cancelPost(id, reason)` and surface `InvalidStateTransitionError` as 409.
- **Non-blocking note:** PATCH handler checks `state !== 'draft'` before UPDATE but UPDATE WHERE lacks `AND state = 'draft'` (TOCTOU on `editedText`). Non-blocking for single-user MVP since it only changes body text, not state.
- **Decision file:** `.squad/decisions/inbox/switch-pr-19-wi-14.md`

### 2026-05-05 ΓÇö Foundation PR review heuristics
- **Run env.ts directly with node** to verify fail-fast behavior ΓÇö don't just read the code. `node` on a TS file with ESM syntax works with a warning but actually throws the right error.
- **`gh pr review --approve` fails on self-owned PRs** ΓÇö always fall back to `--comment` and record the verdict in the decisions inbox. This is a GitHub API constraint, not a workflow bug.
- **Audit vuln triage:** check baseline on `main` first before flagging new vulns from the PR's deps. Transitive dev-dependency vulns from explicitly required packages (drizzle-kit) are not rejection criteria.
- **Changed-files scope check is fast signal:** `git diff --name-only main...HEAD` in seconds tells you if the author touched anything out of scope. Clean scope = good hygiene.
- **Empty-value placeholders in `.env.example` are correct design** ΓÇö empty string for required vars fails zod `min(1)` validation, which forces developers to fill them in before the app starts. Intentional friction.
