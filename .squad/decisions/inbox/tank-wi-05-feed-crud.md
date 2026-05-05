# Decision: WI-05 Feed Source CRUD — Service layer + API routes

**Date:** 2026-05-05
**Author:** Tank
**Branch:** squad/wi-05-feed-source-crud
**Status:** Adopted

## Context

WI-05 requires CRUD API routes for the `feed_sources` table so the dashboard (Trinity's WI-15) and other agents can manage feed subscriptions at runtime without hardcoding.

## Decisions

### 1. Delete strategy: Hard delete

**Chosen:** Hard delete (`DELETE FROM feed_sources WHERE id = ?`)

**Rationale:**
- The schema has `onDelete: "cascade"` on `articles.feed_source_id`, confirming the schema was designed for hard deletes.
- The schema has no `deleted_at` column, ruling out soft-delete as the intended pattern.
- Soft-disable (pausing a feed without removing it) is covered by `PATCH /api/feeds/[id]` with `{ "isActive": false }`, which sets `enabled = false`.

### 2. `isActive` vs `enabled` naming

The task spec uses `isActive` as the parameter name in service function signatures. The DB schema column is `enabled`. Resolution:
- Service functions accept `isActive` in input shapes (matches the WI spec).
- DB writes map `isActive → enabled`.
- API responses return raw DB rows, which expose the `enabled` column name directly.

### 3. Duplicate URL handling

`createFeedSource` performs a SELECT before INSERT. If the URL already exists, it throws `DuplicateFeedSourceError` (carries the existing row). The POST route maps this to HTTP 409 with `{ "error": "Duplicate URL", "existing": { ... } }`. This gives callers the ID of the existing source without a second request.

### 4. Auth gate

`/api/feeds/*` is covered by the existing middleware (Trinity's WI-13 work). The middleware gates all routes except `/login` and `/api/auth/*`. No changes to `middleware.ts` needed.

### 5. SKIP_ENV_VALIDATION

Already wired into `env.ts` on main (merged with WI-19). No action needed.

### 6. Smoke test location

`src/lib/feeds/sources.smoke.ts` — mirrors the WI-04 pattern (`sources.smoke.ts` = service lifecycle, `smoke.ts` = parser). Run with `npx tsx src/lib/feeds/sources.smoke.ts`. Tolerant of DB-unavailable.

## Endpoints delivered

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/feeds` | `listFeedSources({ includeInactive: ?all=1 })` |
| POST | `/api/feeds` | `createFeedSource` |
| GET | `/api/feeds/[id]` | `getFeedSource` |
| PATCH | `/api/feeds/[id]` | `updateFeedSource` |
| DELETE | `/api/feeds/[id]` | `deleteFeedSource` (hard) |
