# Decision: WI-23 Settings UI — Trinity

**Date:** 2026-05-07
**Author:** Trinity
**PR:** squad/wi-23-settings-ui

## What was shipped

Settings page (`/settings`) exposing five `settings` table keys:
`max_posts_per_day`, `min_gap_hours`, `jitter_minutes`, `posting_windows`, `relevance_threshold`.

## Decisions

### 1. Settings helper module is new — not duplicating timing/advisor helpers

`advisor.ts` has private `readNumericSetting()` and `readPostingWindows()` that are file-scoped.
The new `src/lib/settings/index.ts` provides a public `getSetting / setSetting / getAllSettings` API
for use by the settings API route and the settings page SSR. The timing advisor's private helpers
are intentionally left in place to avoid breaking changes; they can be migrated in a future cleanup.

### 2. Time zone select — curated list (19 zones), not full Intl.supportedValuesOf

**Decision:** Use a curated 19-entry list (UTC + major regional zones).

**Rationale:**
- `Intl.supportedValuesOf('timeZone')` returns ~600 entries — unusable as a <select> without search.
- The timing advisor uses UTC for all arithmetic; `tz` is purely an informational label on the stored
  JSONB. There is no runtime impact from limiting choices.
- Operators who need an unlisted zone can set the DB row directly via SQL / admin access.
- Source of truth: `COMMON_TZ` constant in `SettingsForm.tsx`. Easy to extend.

**Reviewers:** Accept this list for v1. Raise a follow-up WI if a time-zone search input is needed.

### 3. relevance_threshold — DB wins, env fallback

Added `getRelevanceThreshold()` to `src/lib/scoring/relevance.ts`.

Resolution order:
1. `settings` table row `relevance_threshold` — if present and in range [0,100]
2. `env.RELEVANCE_THRESHOLD` — coerced integer, defaults to 70 (env schema default)

The env var is NOT removed; it remains the deployment-time default for fresh installs with no DB row.

### 4. PATCH auth gate

The PATCH route relies on the WI-13 middleware that gates all `/api/*` routes behind
`DASHBOARD_PASSWORD`. No additional auth was added. Reviewers: confirm this is sufficient.

### 5. LinkedIn disconnect UX

The existing `POST /api/linkedin/disconnect` redirects to `/?linkedin=disconnected`.
Rather than a full-page navigation away from `/settings`, the Disconnect button does a client-side
`fetch()` POST, checks `res.url` for `linkedin=disconnected`, updates local state, and calls
`router.refresh()`. This keeps the user on the settings page.

## Files changed

| File | Change |
|------|--------|
| `src/lib/settings/index.ts` | New — `getSetting`, `setSetting`, `getAllSettings` |
| `src/app/api/settings/route.ts` | New — `GET` + `PATCH` with Zod validation |
| `src/app/(dashboard)/settings/page.tsx` | New — Server Component, `force-dynamic` |
| `src/app/(dashboard)/settings/_components/SettingsForm.tsx` | New — Client Component |
| `src/lib/scoring/relevance.ts` | Modified — added `getRelevanceThreshold()` helper |
