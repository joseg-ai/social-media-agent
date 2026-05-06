# Switch Decision — WI-14 Queue + History Dashboard (PR #19) — REJECTED

**Reviewer:** Switch  
**Author:** Trinity-4  
**PR:** https://github.com/joseg-ai/social-media-agent/pull/19  
**Date:** 2026-05-06  
**Verdict:** **REJECTED** — two blockers; do not merge

---

## Blockers

### Blocker 1 (HIGH) — `POST /api/posts/[id]/approve` bypasses `approveDraft()`

**File:** `src/app/api/posts/[id]/approve/route.ts`

WI-11 merged to `main` at commit `9e7f354`. The `TODO(WI-11)` fallback path should be gone. The handler still does:

```ts
await db.update(posts)
  .set({ state: "scheduled", scheduledFor: new Date(), updatedAt: new Date() })
  .where(eq(posts.id, id));
```

Problems:

1. **Not atomic.** WHERE is only `eq(posts.id, id)` — no `AND state = 'draft'`. State is checked in a prior read. Two concurrent approve requests can both read `state='draft'`, both issue the UPDATE, and both succeed. `approveDraft()` uses a conditional UPDATE (`WHERE id = X AND state = 'draft'`) that makes exactly one winner.

2. **Unconditionally sets `scheduledFor: new Date()`**, bypassing the timing advisor. `approveDraft()` accepts an optional `schedule_for` and leaves the field null when omitted — the timing advisor owns this value.

**Fix:** Replace raw UPDATE with `approveDraft(id)` from `src/lib/posts/state-machine.ts` (exported via `src/lib/posts/index.ts`).

---

### Blocker 2 (HIGH) — `DELETE /api/posts/[id]` bypasses `cancelPost()`, can force-cancel a `posting` post

**File:** `src/app/api/posts/[id]/route.ts`

No state check at all — raw UPDATE directly:

```ts
await db.update(posts)
  .set({ state: "cancelled", failureReason: reason ?? null, updatedAt: new Date() })
  .where(eq(posts.id, id));
```

`cancelPost()` intentionally rejects `posting → cancelled` — `"posting→cancelled"` is not in `ALLOWED_TRANSITIONS`. A `posting` post is mid-flight to the LinkedIn API. Force-cancelling the DB row while that call is in-flight means:
- DB records `state = 'cancelled'`  
- LinkedIn may successfully post anyway  
- Publisher's `markPosted()` then hits `InvalidStateTransitionError` (can't transition `cancelled → posted`), silently discarding the LinkedIn post ID — no way to retrieve or delete the live post

This raw UPDATE bypasses that protection entirely.

**Fix:** Replace with `cancelPost(id, reason)`. If `cancelPost` throws `InvalidStateTransitionError` (post is `posting` or already terminal), return 409:
```ts
return NextResponse.json(
  { error: "Post is currently being submitted, retry in a moment" },
  { status: 409 }
);
```

---

## Everything else passes

| Check | Result |
|-------|--------|
| `queries.ts` 3-table join | ✅ posts + articles + feed_sources, `innerJoin` both |
| SQL injection | ✅ Drizzle params throughout; `sql\`...\`` template only used for column refs |
| Char count | ✅ `[...text].length` in both PostCard and EditDraftForm |
| Markdown rendering | ✅ None — body in `<pre className="whitespace-pre-wrap">` |
| `force-dynamic` | ✅ Both `/queue/page.tsx` and `/history/page.tsx` |
| Pagination | ✅ offset = (page-1)*50; page 1 → offset 0; sentinel pattern clean |
| Layout.tsx | ✅ Already on `main` with all 6 links (Feeds, Queue, History, Prompts, Usage, Settings); not in diff |
| Cross-territory scope | ✅ Only adds queue/history pages, posts API routes, posts/queries.ts |
| Lint | ✅ Exit 0 (1 pre-existing warning in publisher.ts, not from this PR) |
| Build | ✅ Exit 0 — 13 routes including `/queue`, `/history`, `/api/posts`, `/api/posts/[id]`, `/api/posts/[id]/approve` |

### Non-blocking note — PATCH TOCTOU

`PATCH /api/posts/[id]` checks `state !== 'draft'` in a prior read, then does `db.update().set({ editedText: newBody })` with no `AND state = 'draft'` in WHERE. Two concurrent edits can race; the last write wins on `editedText`. Since only `editedText` is changed (not state) and this is a single-user MVP, impact is bounded. Not a blocker.
