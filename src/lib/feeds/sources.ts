/**
 * Feed source service — CRUD operations against the `feed_sources` table.
 *
 * Delete strategy: HARD DELETE (with pre-check)
 *   The schema has `onDelete: "cascade"` on `articles.feed_source_id` but
 *   `onDelete: "restrict"` on `posts.article_id`. Deleting a feed source
 *   whose articles have associated posts will fail at the DB level.
 *   `deleteFeedSource` pre-checks for posts and throws `FeedSourceHasPostsError`
 *   (→ 409) rather than letting Postgres return an unhandled FK violation.
 *   Soft-disable via `updateFeedSource({ isActive: false })` is the safe
 *   alternative when posts exist.
 *
 * Duplicate handling:
 *   `createFeedSource` and `updateFeedSource` both throw `DuplicateFeedSourceError`
 *   when the URL already exists — whether caught by the app-level pre-check or
 *   by the DB unique constraint (code 23505) from a concurrent race.
 *   Callers (API routes) map this to HTTP 409.
 */
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { feedSources, articles, posts } from "@/db/schema";
import type { CreateFeedSourceInput, UpdateFeedSourceInput } from "./validators";

export type FeedSource = typeof feedSources.$inferSelect;

/** Thrown by `createFeedSource` / `updateFeedSource` when the URL already exists in the DB. */
export class DuplicateFeedSourceError extends Error {
  readonly existing: FeedSource;
  constructor(existing: FeedSource) {
    super(`A feed source with URL "${existing.url}" already exists (id: ${existing.id})`);
    this.name = "DuplicateFeedSourceError";
    this.existing = existing;
  }
}

/**
 * Thrown by `deleteFeedSource` when the feed source has posts linked through
 * its articles. Postgres would refuse the delete with an FK violation (23503)
 * because `posts.article_id` is ON DELETE RESTRICT. We detect this before the
 * query and surface a user-friendly error instead of a 500.
 */
export class FeedSourceHasPostsError extends Error {
  readonly postCount: number;
  constructor(postCount: number) {
    super(
      `Cannot delete: feed source has ${postCount} associated post(s). Set isActive=false to disable instead.`,
    );
    this.name = "FeedSourceHasPostsError";
    this.postCount = postCount;
  }
}

/** Returns true if a postgres-js error is a unique-constraint violation (code 23505). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}

/**
 * List all feed sources.
 * By default only active (enabled) sources are returned.
 * Pass `{ includeInactive: true }` to include disabled sources.
 */
export async function listFeedSources(
  opts: { includeInactive?: boolean } = {},
): Promise<FeedSource[]> {
  const query = db.select().from(feedSources);
  if (!opts.includeInactive) {
    return query.where(eq(feedSources.enabled, true));
  }
  return query;
}

/**
 * Get a single feed source by ID.
 * Returns `null` if no record exists (never throws for not-found).
 */
export async function getFeedSource(id: string): Promise<FeedSource | null> {
  const [row] = await db
    .select()
    .from(feedSources)
    .where(eq(feedSources.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Create a new feed source.
 *
 * - Deduplicates by URL: app-level pre-check + DB unique constraint guard.
 * - If two concurrent requests race past the SELECT, the INSERT loser receives
 *   Postgres error 23505 (unique_violation) which is caught and converted to
 *   `DuplicateFeedSourceError` rather than leaking a 500.
 *
 * @throws {DuplicateFeedSourceError} if the URL is already registered.
 */
export async function createFeedSource(input: CreateFeedSourceInput): Promise<FeedSource> {
  const [existing] = await db
    .select()
    .from(feedSources)
    .where(eq(feedSources.url, input.url))
    .limit(1);

  if (existing) {
    throw new DuplicateFeedSourceError(existing);
  }

  try {
    const [created] = await db
      .insert(feedSources)
      .values({
        name: input.name,
        url: input.url,
        enabled: input.isActive ?? true,
      })
      .returning();

    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Race condition: another request inserted between our SELECT and INSERT.
      // Re-query to get the winning row so we can report it properly.
      const [raceExisting] = await db
        .select()
        .from(feedSources)
        .where(eq(feedSources.url, input.url))
        .limit(1);
      throw new DuplicateFeedSourceError(raceExisting!);
    }
    throw err;
  }
}

/**
 * Update a feed source by ID.
 * Returns the updated row, or `null` if the ID does not exist.
 *
 * If `url` is changed to a value that already exists, throws
 * `DuplicateFeedSourceError` (from either the DB unique constraint or a
 * future app-level pre-check). The PATCH route maps this to 409.
 *
 * @throws {DuplicateFeedSourceError} if the new URL is already in use.
 */
export async function updateFeedSource(
  id: string,
  patch: UpdateFeedSourceInput,
): Promise<FeedSource | null> {
  const updateData: Partial<typeof feedSources.$inferInsert> = { updatedAt: new Date() };

  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.url !== undefined) updateData.url = patch.url;
  if (patch.isActive !== undefined) updateData.enabled = patch.isActive;

  try {
    const [updated] = await db
      .update(feedSources)
      .set(updateData)
      .where(eq(feedSources.id, id))
      .returning();

    return updated ?? null;
  } catch (err) {
    if (isUniqueViolation(err) && patch.url !== undefined) {
      // The new URL collides with an existing feed source.
      const [conflicting] = await db
        .select()
        .from(feedSources)
        .where(eq(feedSources.url, patch.url))
        .limit(1);
      throw new DuplicateFeedSourceError(conflicting!);
    }
    throw err;
  }
}

/**
 * Hard-delete a feed source by ID.
 *
 * Pre-checks for posts linked through this source's articles before attempting
 * the delete. The DB schema has `posts.article_id` ON DELETE RESTRICT, so
 * Postgres would refuse the cascade if posts exist — surfacing a raw 500.
 * Instead we count and throw `FeedSourceHasPostsError` (→ 409), directing
 * the caller to use `PATCH { isActive: false }` to soft-disable instead.
 *
 * If no posts exist the DELETE proceeds and cascades to articles cleanly
 * (articles.feed_source_id is ON DELETE CASCADE).
 *
 * Returns `true` if a row was deleted, `false` if ID not found.
 *
 * @throws {FeedSourceHasPostsError} if any posts reference this source's articles.
 */
export async function deleteFeedSource(id: string): Promise<boolean> {
  const [{ postCount }] = await db
    .select({ postCount: count() })
    .from(posts)
    .innerJoin(articles, eq(posts.articleId, articles.id))
    .where(eq(articles.feedSourceId, id));

  if (postCount > 0) {
    throw new FeedSourceHasPostsError(postCount);
  }

  const [deleted] = await db
    .delete(feedSources)
    .where(eq(feedSources.id, id))
    .returning({ id: feedSources.id });

  return !!deleted;
}
