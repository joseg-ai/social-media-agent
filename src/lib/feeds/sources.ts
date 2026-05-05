/**
 * Feed source service — CRUD operations against the `feed_sources` table.
 *
 * Delete strategy: HARD DELETE
 *   The schema has `onDelete: "cascade"` on `articles.feed_source_id`, so
 *   deleting a feed source also removes all its articles. Soft-disable is
 *   handled by `updateFeedSource({ isActive: false })` which sets `enabled=false`.
 *   No `deleted_at` column exists in the schema, confirming hard delete intent.
 *
 * Duplicate handling: `createFeedSource` throws `DuplicateFeedSourceError`
 *   when the URL already exists. Callers (API routes) map this to HTTP 409.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feedSources } from "@/db/schema";
import type { CreateFeedSourceInput, UpdateFeedSourceInput } from "./validators";

export type FeedSource = typeof feedSources.$inferSelect;

/** Thrown by `createFeedSource` when the URL already exists in the DB. */
export class DuplicateFeedSourceError extends Error {
  readonly existing: FeedSource;
  constructor(existing: FeedSource) {
    super(`A feed source with URL "${existing.url}" already exists (id: ${existing.id})`);
    this.name = "DuplicateFeedSourceError";
    this.existing = existing;
  }
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
 * - Validates URL format (via Zod upstream, but also guarded here at service boundary).
 * - Deduplicates by URL: throws `DuplicateFeedSourceError` with the existing row.
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

  const [created] = await db
    .insert(feedSources)
    .values({
      name: input.name,
      url: input.url,
      enabled: input.isActive ?? true,
    })
    .returning();

  return created;
}

/**
 * Update a feed source by ID.
 * Returns the updated row, or `null` if the ID does not exist.
 */
export async function updateFeedSource(
  id: string,
  patch: UpdateFeedSourceInput,
): Promise<FeedSource | null> {
  const updateData: Partial<typeof feedSources.$inferInsert> = { updatedAt: new Date() };

  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.url !== undefined) updateData.url = patch.url;
  if (patch.isActive !== undefined) updateData.enabled = patch.isActive;

  const [updated] = await db
    .update(feedSources)
    .set(updateData)
    .where(eq(feedSources.id, id))
    .returning();

  return updated ?? null;
}

/**
 * Hard-delete a feed source by ID.
 * Cascades to all `articles` referencing this source.
 * Returns `true` if a row was deleted, `false` if ID not found.
 */
export async function deleteFeedSource(id: string): Promise<boolean> {
  const [deleted] = await db
    .delete(feedSources)
    .where(eq(feedSources.id, id))
    .returning({ id: feedSources.id });

  return !!deleted;
}
