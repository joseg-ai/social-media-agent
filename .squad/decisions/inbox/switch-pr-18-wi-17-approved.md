# Switch Decision — WI-17 Token Usage / Cost Dashboard (PR #18) — APPROVED + MERGED

**Reviewer:** Switch  
**Author:** Trinity-6 (revision of Trinity-3's original)  
**PR:** https://github.com/joseg-ai/social-media-agent/pull/18  
**Date:** 2026-05-06  
**Verdict:** **APPROVED + MERGED** (squash merge, branch deleted)  
**Merged at:** `2a48398` on `main`

---

## Both blockers from first review resolved

### Blocker 1 (HIGH) — layout.tsx now on main ✅

PR #17 (WI-15) merged to `main` at `bd2be33` before this re-review.  
`git show origin/main:src/app/(dashboard)/layout.tsx` → file exists.

Performed `git rebase origin/main` on `squad/wi-17-usage-ui` — clean, zero conflicts.  
WI-17 never touches `layout.tsx`; it simply inherits the file from WI-15 via rebase.  

Post-rebase `NAV_LINKS` in `layout.tsx`:
```ts
const NAV_LINKS = [
  { href: "/feeds",    label: "Feeds"    },  // ← from WI-15
  { href: "/queue",    label: "Queue"    },
  { href: "/history",  label: "History"  },
  { href: "/prompts",  label: "Prompts"  },
  { href: "/usage",    label: "Usage"    },  // ← present (WI-17 nav link)
  { href: "/settings", label: "Settings" },
] as const;
```

Both Feeds and Usage confirmed present. ✅  
Force-pushed rebased branch before merge (`git push --force-with-lease`).

---

### Blocker 2 (MEDIUM) — Pricing contract clarified, dead code removed ✅

Commit `c21c752` addressed all three sub-issues:

1. **JSDoc on `PRICING_USD_PER_1K_TOKENS`** — documents that keys must match `env.AZURE_OPENAI_DEPLOYMENT` (the deployment slug stored in `llm_calls.model`), not the canonical OpenAI model name. Instructs operators to name their deployment to match or add an explicit entry. ✅

2. **JSDoc on `estimateCostUsd()`** — repeats the key-matching contract at the call site. ✅

3. **Claude entries removed** — `claude-sonnet-4.6`, `claude-haiku-4.5`, `claude-opus-4.5` deleted. All production LLM calls route through Azure OpenAI; Claude entries were dead code. ✅

4. **`DEFAULT_PRICING` corrected** — relabeled as "conservative fallback for unrecognised deployment slug." Value raised to `{ prompt: 0.005, completion: 0.015 }` (intentionally higher than named rates so unknown slugs err toward over-reporting cost, not under). No false claim of "GPT-4o rates." ✅

---

## Scope audit (post-rebase diff vs main)

| File | Role |
|------|------|
| `src/app/(dashboard)/usage/page.tsx` | New — dashboard Server Component |
| `src/app/api/usage/route.ts` | New — `GET /api/usage?range=` endpoint |
| `src/lib/llm/pricing.ts` | New — pricing table + `estimateCostUsd()` |
| `src/lib/llm/usage.ts` | Modified — added `listRecentCalls(limit)` |
| `src/lib/llm/index.ts` | Modified — re-exported new functions |
| `.squad/agents/trinity/history.md` | Squad history only |

No posts / feeds / drafts / scoring / timing files touched. ✅

---

## CI results

| Check | Result |
|-------|--------|
| Lint (`npm run lint`) | Exit 0 — 1 pre-existing warning in `publisher.ts` (not from this PR) ✅ |
| Build (`SKIP_ENV_VALIDATION=1 npm run build`) | Exit 0 — `/usage` and `/api/usage` both in route manifest ✅ |
| TypeScript | Clean ✅ |
| Static pages | 13/13 ✅ |

---

## Forward note — WI-14

`squad/wi-14-queue-history-ui` has its own copy of `layout.tsx` that diverged from `main` before WI-15 merged. Trinity-4 (WI-14) **must rebase onto `main` (now at `2a48398`)** before that PR can merge, and should keep the existing `NAV_LINKS` array intact (union of all links already present in the WI-15 version).
