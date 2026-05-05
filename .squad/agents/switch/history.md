# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster pulling from Microsoft RSS + learn.microsoft.com with smart timing.
- **Stack:** Next.js 15, React 19, TypeScript, Tailwind 4. Test framework TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own testing (NBSP-spacing snapshot tests, draft rendering validation)
- **IDs you own:** Observability wave (test framework selection, posting flow tests, NBSP rendering validation snapshot tests)
- **Reference:** .squad/decisions/decisions.md contains master prompt with NBSP requirements and all resolved decisions (Q1-Q9)

### 2026-05-05 — WI-01 Foundation PR #3 reviewed → APPROVED
- **Status:** APPROVED. Tank's WI-01 foundation passes all acceptance criteria.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/3
- **What was verified:** 5 module dirs + placeholders, tsconfig path aliases (`tsc --noEmit` clean), `.env.example` with all 11 required vars, `env.ts` fail-fast confirmed by runtime test (throws listing all missing fields, no value leakage), docker-compose postgres:16 + named volume matches DATABASE_URL hint, drizzle.config.ts placeholder correct, lint clean, build clean (Turbopack), 15 changed files all in scope.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own PR). Review comment posted instead; verdict recorded in `.squad/decisions/inbox/switch-pr-3-review.md`.

### 2026-05-05 — WI-19 LinkedIn OAuth PR #7 reviewed → APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Crypto core correct (fresh IV, authTag verified, timingSafeEqual). Key finding: `iv`/`authTag` columns are NOT "unused by design" — `storeTokenResponse` actively writes them (redundant + asymmetric, not a security issue). Follow-ups: stop writing redundant columns, add key-length `.refine()` in env.ts.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/7
- **Decision file:** `.squad/decisions/inbox/switch-pr-7-review.md`

## Learnings

### 2026-05-05 — WI-10 Prompt Management PR #8 reviewed → APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's WI-10 prompt service is solid for single-user operation.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/8
- **What was verified:** Transaction wrapping on activate-swap (both `createPromptVersion` and `activatePromptVersion` use `db.transaction()`), render correctness (`PromptRenderError` thrown on missing vars, extras silently ignored, whitespace preserved), seed idempotency (checks `isActive=true` before insert), API surface alignment with WI-07/08/09 (composite key, typed errors, all public types exported), schema alignment with `prompts` table in `schema.ts`.
- **Issues found:**
  - MEDIUM (`index.ts:180`): `listPromptHistory` called outside transaction — version number race under concurrent writes. No unique constraint on `(name, promptType, version)` to catch it. Fix before WI-16 multi-user dashboard.
  - LOW (`seed.ts:191`): Seed idempotency check uses `isActive=true` only; deactivated-then-re-seed creates duplicate v1.
  - INFO (`smoke.ts`): Smoke test reimplements service logic inline, doesn't call production functions.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own-org PR). Review comment posted instead.
- **Decision file:** `.squad/decisions/inbox/switch-pr-8-review.md`
### 2026-05-05 — WI-18 PR #9 reviewed -> APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's token usage persistence layer passes all acceptance criteria.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/9
- **What was verified:** Fire-and-forget try/catch wraps entire `emitUsageLog` body; both call sites use `void`; `[llm_calls insert failed]` tag confirmed. All `UsageLogEntry` required fields preserved; new optional FK fields are additive. Schema NOT NULL column audit complete — all covered by mapping or DB defaults. `getTotalTokensInRange` uses `sum()` not `count()` for tokens. Inclusive bounds documented in JSDoc.
- **Issues flagged:** LOW — missing inline comment in `emitUsageLog` body explaining `request_id` is intentionally dropped (no schema column). INFO — smoke test uses two separate DB connections; test row leaks on assertion failure. INFO — `llm_calls.success` column always `true` (misleading name, design-level note for WI-17).
- **API limitation:** `gh pr review --approve` rejected (cannot approve own PR). Review comment posted instead; verdict recorded in `.squad/decisions/inbox/switch-pr-9-review.md`.

### 2026-05-05 — WI-04 RSS Parser + Ingestion PR #10 reviewed → APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Tank's WI-04 RSS parser + ingestion is solid.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/10
- **What was verified:** Error contract (network errors caught/returns `{0,0}`, DB errors rethrow, `lastErrorMessage: null` cleared on success ✅), dedupe via `articles.url` unique constraint (exists at `schema.ts:81`) + `onConflictDoNothing().returning()` count correctness ✅, 15s timeout ✅, all NOT NULL columns populated ✅, build/lint clean ✅.
- **Issues found:**
  - LOW (`parser.ts`): No URL scheme validation before `parseFeed()` — SSRF-class risk (file://, gopher://). Mitigated by `feed_sources` being admin-only DB access. Recommend adding scheme guard in WI-06 or micro-fix.
  - LOW (`ingest.ts`): `consecutiveFailCount` increment is read-modify-write in app code — race under concurrent ingests. Covered by WI-06 advisory locks.
  - INFO (`schema.ts` — WI-02 artefact): Composite `unique(url, content_hash)` is dead code since `url` alone is already globally unique. Not harmful, not in scope.
- **API limitation:** `gh pr review --approve` rejected (cannot approve own-org PR). Review comment posted instead.
- **Decision file:** `.squad/decisions/inbox/switch-pr-10-review.md`

### 2026-05-05 — WI-09 Draft Generator PR #12 reviewed → APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES. Oracle's WI-09 draft generator is functionally correct for single-user MVP.
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/12
- **What was verified:** sanitizeBody unit-tested (null bytes, ZWJ, bold, italic, headings, NBSP preserved ✅), char-limit spread `[...body]` counts code points not UTF-16 units ✅, 2999+1=3000 boundary correct ✅, state='draft' hard-coded ✅, article set to 'selected' after success ✅, chat() emitUsageLog path not bypassed ✅, batch try/catch per article ✅, lint clean ✅, build clean ✅.
- **Schema migration:** `0001_article_status.sql` adds `article_status` ENUM + `articles.status DEFAULT 'new' NOT NULL` — backwards-compatible with existing rows ✅. Not idempotent (no `IF NOT EXISTS`), acceptable for drizzle-managed workflow.
- **Issues found:**
  - MEDIUM (`schema.ts`, posts table): Missing `unique()` on `posts.article_id` — TOCTOU race window between SELECT-check and INSERT. No DB-level guard against duplicate posts per article. Recommend adding in WI-11 when Tank touches the posts table.
  - MEDIUM (`generator.ts:231-245`): No transaction wrapping post INSERT + article status UPDATE. Crash between the two leaves article permanently at `status='scored'` with an orphaned post. Fix: `db.transaction()` around both statements.
  - INFO (`generator.ts:203`): `chat()` called before post INSERT, so `llm_calls.postId` is always NULL for draft calls. FK exists but unused for this case.
- **Decision file:** `.squad/decisions/inbox/switch-pr-12-wi-09.md`

### 2026-05-05 — WI-07 Relevance Scorer PR #15 reviewed → APPROVED WITH NOTES
- **Status:** APPROVED WITH NOTES (rebase required before merge).
- **PR link:** https://github.com/joseg-ai/social-media-agent/pull/15
- **What was verified:** Schema migration (`NOT NULL DEFAULT 'new'` correct for existing rows ✅), JSON parse robustness (`chatJSON` safeParse → `AppError` throw → per-article catch in batch → `failed++` ✅), threshold default (`RELEVANCE_THRESHOLD: z.coerce.number().default(70)` in env.ts ✅), batch failure isolation (per-article try/catch ✅), idempotency (UPDATE not INSERT, batch filters `status='new'` ✅), token usage (`chatJSON→chat→emitUsageLog` ✅), prompt rendering (`getActivePrompt + renderPrompt + master_context fallback ✅), lint + build clean ✅.
- **Blocker found:** PR #12 (WI-09) merged into `main` before this PR. WI-09 included WI-07's `0001_article_status.sql` and `schema.ts` changes as a dependency. Merging WI-07's branch to current `main` will conflict on schema.ts (enum comment wording, index ordering) and the migration file (whitespace). **Oracle must rebase on main** — after rebase, the duplicate files vanish from the diff; only `src/lib/scoring/`, env.ts RELEVANCE_THRESHOLD remain.
- **Minor notes:** `normaliseScore(1)` ambiguity for future integer prompts (documented, non-blocking), no status guard on direct `scoreArticle` calls (informational), `schemaDescription` system message says 0-100 while v1 prompt returns 0-1 (low risk).
- **Decision file:** `.squad/decisions/inbox/switch-pr-15-wi-07.md`

### 2026-05-05 — Foundation PR review heuristics
- **Run env.ts directly with node** to verify fail-fast behavior — don't just read the code. `node` on a TS file with ESM syntax works with a warning but actually throws the right error.
- **`gh pr review --approve` fails on self-owned PRs** — always fall back to `--comment` and record the verdict in the decisions inbox. This is a GitHub API constraint, not a workflow bug.
- **Audit vuln triage:** check baseline on `main` first before flagging new vulns from the PR's deps. Transitive dev-dependency vulns from explicitly required packages (drizzle-kit) are not rejection criteria.
- **Changed-files scope check is fast signal:** `git diff --name-only main...HEAD` in seconds tells you if the author touched anything out of scope. Clean scope = good hygiene.
- **Empty-value placeholders in `.env.example` are correct design** — empty string for required vars fails zod `min(1)` validation, which forces developers to fill them in before the app starts. Intentional friction.
