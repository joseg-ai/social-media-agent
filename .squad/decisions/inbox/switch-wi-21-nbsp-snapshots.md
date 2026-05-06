# WI-21: NBSP Spacing Snapshot Tests ΓÇö Build Decision

**Date:** 2026-05-06
**Author:** Switch (builder hat)
**Status:** Proposed ΓÇö awaiting PR review

---

## What NBSP behaviour is being locked in

LinkedIn collapses plain `\n\n` between paragraphs in the feed renderer. To produce a
visible blank line, the spacing character must be U+00A0 (non-breaking space). The
expected blank-line pattern is:

```
paragraph1\n\u00A0\nparagraph2
```

That is: newline ΓåÆ NBSP ΓåÆ newline.

The WI-09 draft generator (Oracle) encodes this as a prompt-level contract: the
`draft_generator` prompt instructs the LLM to emit NBSP for blank lines. The sanitizer
(`sanitizeBody()` in `src/lib/drafts/generator.ts`) then **preserves** whatever the LLM
emits ΓÇö it strips zero-width characters (U+200BΓÇô200D, FEFF, U+00AD) but **not** U+00A0.

This was already covered by a single assertion in the smoke test:
```typescript
assert(
  sanitizeBody("line\u00A0blank\u00A0line") === "line\u00A0blank\u00A0line",
  "preserves U+00A0 (NBSP) spacing",
);
```

WI-21 promotes that contract into a dedicated, stable snapshot test suite.

---

## Where it comes from in the pipeline

```
LLM output (via chat())
  ΓööΓöÇ content field contains \n\u00A0\n between paragraphs
       ΓööΓöÇ sanitizeBody() strips markdown noise, preserves NBSP
            ΓööΓöÇ body stored in posts.draftText
                 ΓööΓöÇ posted to LinkedIn (renders as visible blank line)
```

If `sanitizeBody()` were ever changed to strip U+00A0 (e.g., by widening the zero-width
regex to include `\u00A0`), the snapshot tests in
`src/lib/drafts/generator.snapshot.test.ts` would fail loudly on the next `npm test` run.

---

## Test structure (15 tests, 6 suites)

| Suite | Tests | Purpose |
|-------|-------|---------|
| Single paragraph | 2 | Baseline: no NBSP needed, no regressions |
| Two paragraphs with NBSP | 3 | Preserve 1 blank line, exact NBSP pattern |
| Three paragraphs with NBSP | 3 | Preserve 2 blank lines |
| JSON round-trip | 2 | NBSP survives JSON.stringify ΓåÆ JSON.parse |
| Negative: `\n\n` not upgraded | 2 | Document sanitizer pass-through contract |
| Byte-level verification | 3 | U+00A0 identity, no lookalike confusion |

---

## Framework choice: vitest

Rationale:
- Existing smoke tests are plain `tsx`-executed scripts gated by `RUN_LLM_SMOKE=1` ΓÇö no
  test framework, no assertions library.
- For snapshot testing, vitest is the canonical choice in the TypeScript/Vite ecosystem:
  inline snapshots, vi.mock() hoisting, and `--run` (CI) mode all built-in.
- Jest was not chosen per task spec.
- `@vitest/snapshot` provides the `.toMatchInlineSnapshot()` assertions.

---

## How to update the snapshot if the contract intentionally changes

If the NBSP pattern is intentionally changed (e.g., double NBSP, or `\r\n` line endings):

1. Confirm the change in `sanitizeBody()` or the prompt contract is intentional.
2. Run `npx vitest run -u` to auto-update all inline snapshots.
3. Review the diff carefully ΓÇö every snapshot update should show the exact character
   change that was intended.
4. Update this decision file and the test file's comment block to document the new contract.

---

## Negative test contract

`sanitizeBody()` does **not** upgrade `\n\n` to `\n\u00A0\n`. This is intentional design:

- The sanitizer is a defensive clean-up pass, not a contract enforcer.
- NBSP injection in the sanitizer would mask LLM prompt failures silently.
- If the LLM returns `\n\n`, blank lines collapse on LinkedIn. This is a signal to fix
  the prompt, not the sanitizer.
- The negative test (`sanitizeBody ΓÇö negative: plain \\n\\n is NOT upgraded to NBSP`)
  documents this boundary so future developers understand why NBSP is missing rather than
  adding a "fix" in the wrong layer.
