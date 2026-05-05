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

### 2026-05-05 — Foundation PR review heuristics
- **Run env.ts directly with node** to verify fail-fast behavior — don't just read the code. `node` on a TS file with ESM syntax works with a warning but actually throws the right error.
- **`gh pr review --approve` fails on self-owned PRs** — always fall back to `--comment` and record the verdict in the decisions inbox. This is a GitHub API constraint, not a workflow bug.
- **Audit vuln triage:** check baseline on `main` first before flagging new vulns from the PR's deps. Transitive dev-dependency vulns from explicitly required packages (drizzle-kit) are not rejection criteria.
- **Changed-files scope check is fast signal:** `git diff --name-only main...HEAD` in seconds tells you if the author touched anything out of scope. Clean scope = good hygiene.
- **Empty-value placeholders in `.env.example` are correct design** — empty string for required vars fails zod `min(1)` validation, which forces developers to fill them in before the app starts. Intentional friction.
