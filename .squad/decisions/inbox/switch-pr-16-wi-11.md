# Switch Review Decision — WI-11 Post State Machine (PR #16)

**Reviewer:** Switch  
**Author:** Tank  
**PR:** https://github.com/joseg-ai/social-media-agent/pull/16  
**Branch:** `squad/wi-11-post-state-machine`  
**Date:** 2026-05-06  
**Verdict:** APPROVE WITH NOTES → Merged ✅

---

## Summary

Tank's WI-11 delivers: `transitionPost()` core with optimistic concurrency, 9-pair
`ALLOWED_TRANSITIONS` allowlist, helper functions (`approveDraft`, `cancelPost`,
`claimForPosting`, `markPosted`, `markFailed`, `retryFailed`), `scheduleDraft` /
`scheduleAllDrafts` bridging the WI-08 timing advisor, `claimReadyPosts` / `publishPost`
stub in publisher, smoke tests, and migration `0002`.

All critical correctness checks pass. One docstring issue creates a misleading API
contract for WI-14 integration.

---

## Verified

| Check | Result |
|-------|--------|
| Transition allowlist — 9 pairs | ✅ Complete and correct |
| Race condition (`claimForPosting`) | ✅ Conditional UPDATE atomic; exactly 1 winner traced |
| `claimReadyPosts` error routing | ✅ Only `InvalidStateTransitionError` swallowed; others rethrown |
| Migration `0002` additive-only | ✅ `failure_count NOT NULL DEFAULT 0`, `cancel_reason TEXT NULL`, posts table only |
| `markPosted` double-call | ✅ Clean `InvalidStateTransitionError`, no crash |
| `scheduleDraft` all 3 outcomes | ✅ `post_now` / `schedule_for` / `skip` all handled correctly |
| Error class exports | ✅ Both error types exported from state-machine + index |
| Lint | ✅ Exit 0 |
| TypeScript (Tank's files) | ✅ Zero errors; 4 pre-existing errors all in Trinity's untracked WI-14/WI-17 |

---

## Finding — MEDIUM

### `cancelPost()` docstring false contract for `posting` state

**File:** `src/lib/posts/state-machine.ts:180`

The JSDoc says:
> *"any non-terminal state → cancelled. If the post is already in a terminal state (posted/cancelled) throws."*

**Reality:** `posting→cancelled` is **not** in `ALLOWED_TRANSITIONS`. Calling `cancelPost(id)`
when the post is in `posting` state will throw `InvalidStateTransitionError` immediately
(before any DB round-trip).

This is **intentional by design** — once a post is claimed for publishing, it must complete or
fail; it cannot be cancelled mid-flight. The logic is correct. Only the docstring is wrong.

**Integration risk:** Trinity's WI-14 DELETE handler (`src/app/api/posts/[id]/route.ts`)
wraps `cancelPost()` in a broad `catch {}` that swallows **all** errors including real state
machine violations. When `cancelPost()` throws for a `posting` post, the catch silently falls
through to a raw `db.update()` that writes `state='cancelled'` without going through the state
machine — bypassing the transition guard entirely.

**Fix:** Update the `cancelPost` JSDoc to read:
> *"Cancels a draft, scheduled, or failed post. Throws `InvalidStateTransitionError` for posts
> in `posting` or terminal states."*

No code change needed in the state machine itself.

---

## Non-blocking Notes

- **Silent scheduling limbo:** `approveDraft()` without `schedule_for` leaves `scheduledFor=null`.
  SQL `lte(scheduledFor, now)` treats NULL as not-past, so the post sits in `scheduled` state
  forever and is never claimed. Documented in the JSDoc but a subtle footgun for WI-14's
  approve action.

- **`scheduleDraft` not idempotent:** A second call throws `InvalidStateTransitionError`
  (post already in `scheduled` state). Not a bug, but undocumented. WI-14 approve route
  should guard against double-submit at the HTTP layer.

- **WI-14 function names are stable:** `approveDraft(id, {schedule_for})` and
  `cancelPost(id, reason?)` match what Trinity's untracked routes already call.
  No signature changes needed.

---

## Decision

Merged as-is. The one MEDIUM finding requires a docstring fix only — no logic changes.
Tank or Trinity can patch the docstring as a follow-up; it does not block any merge.
