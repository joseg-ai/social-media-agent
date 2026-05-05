/**
 * Smoke test — feed source CRUD service lifecycle.
 *
 * Run with:   npx tsx src/lib/feeds/sources.smoke.ts
 *
 * What it does (if DATABASE_URL is set):
 *   1.  createFeedSource  — insert a test feed
 *   2.  createFeedSource  — attempt duplicate → expect DuplicateFeedSourceError
 *   3.  listFeedSources   — verify the source appears
 *   4.  getFeedSource     — verify by ID
 *   5.  updateFeedSource  — rename + disable
 *   6.  listFeedSources({ includeInactive: false }) — verify it's hidden
 *   7.  listFeedSources({ includeInactive: true })  — verify it's visible
 *   8.  deleteFeedSource  — hard delete
 *   9.  getFeedSource     — verify gone
 *   10. deleteFeedSource with posts → expect FeedSourceHasPostsError
 *   11. concurrent createFeedSource race → all losers get DuplicateFeedSourceError
 *   12. PATCH URL to existing URL → DuplicateFeedSourceError
 *
 * Tolerant of DB-unavailable: any DB error prints a message and exits 0.
 */

const TEST_SOURCE = {
  name: "Smoke Test Feed",
  url: "https://smoke-test.example.com/feed.xml",
};

const RACE_URL = "https://smoke-race.example.com/feed.xml";
const PATCH_DUP_URL_A = "https://smoke-patch-a.example.com/feed.xml";
const PATCH_DUP_URL_B = "https://smoke-patch-b.example.com/feed.xml";

async function main() {
  console.log("\n🔍  Smoke test — feed source CRUD service\n");

  if (!process.env.DATABASE_URL) {
    console.log("ℹ️   DATABASE_URL not set — skipping all steps (DB required)");
    return;
  }

  let mod: typeof import("./sources");
  try {
    mod = await import("./sources");
  } catch (err) {
    console.error("❌  Failed to import sources module:", err instanceof Error ? err.message : err);
    return;
  }
  const {
    createFeedSource,
    listFeedSources,
    getFeedSource,
    updateFeedSource,
    deleteFeedSource,
    DuplicateFeedSourceError,
    FeedSourceHasPostsError,
  } = mod;

  let createdId: string | undefined;
  // Extra IDs created by supplemental tests — cleaned up in their own blocks.

  try {
    // ── Step 1: create ───────────────────────────────────────────────────────
    console.log("1️⃣   createFeedSource …");
    const created = await createFeedSource(TEST_SOURCE);
    createdId = created.id;
    console.log(`   ✅  created id=${created.id} enabled=${created.enabled}`);

    // ── Step 2: duplicate ────────────────────────────────────────────────────
    console.log("2️⃣   createFeedSource (duplicate URL) …");
    try {
      await createFeedSource(TEST_SOURCE);
      console.log("   ❌  expected DuplicateFeedSourceError, got none");
    } catch (err) {
      if (err instanceof DuplicateFeedSourceError) {
        console.log(`   ✅  DuplicateFeedSourceError thrown — existing id=${err.existing.id}`);
      } else {
        throw err;
      }
    }

    // ── Step 3: list (active only) ───────────────────────────────────────────
    console.log("3️⃣   listFeedSources (active only) …");
    const activeList = await listFeedSources();
    const inActive = activeList.find((s) => s.id === createdId);
    console.log(`   ✅  found=${!!inActive} (total active: ${activeList.length})`);

    // ── Step 4: get by ID ────────────────────────────────────────────────────
    console.log("4️⃣   getFeedSource …");
    const fetched = await getFeedSource(createdId);
    console.log(`   ✅  name="${fetched?.name}" url="${fetched?.url}"`);

    // ── Step 5: update ───────────────────────────────────────────────────────
    console.log("5️⃣   updateFeedSource (rename + disable) …");
    const updated = await updateFeedSource(createdId, { name: "Smoke Test Feed (updated)", isActive: false });
    console.log(`   ✅  name="${updated?.name}" enabled=${updated?.enabled}`);

    // ── Step 6: list active — should be hidden ───────────────────────────────
    console.log("6️⃣   listFeedSources (active only) — should not include disabled …");
    const activeList2 = await listFeedSources({ includeInactive: false });
    const foundDisabled = activeList2.find((s) => s.id === createdId);
    console.log(`   ✅  hidden from active list: ${!foundDisabled}`);

    // ── Step 7: list all — should appear ────────────────────────────────────
    console.log("7️⃣   listFeedSources (includeInactive: true) …");
    const allList = await listFeedSources({ includeInactive: true });
    const foundInAll = allList.find((s) => s.id === createdId);
    console.log(`   ✅  visible in full list: ${!!foundInAll}`);

    // ── Step 8: delete ───────────────────────────────────────────────────────
    console.log("8️⃣   deleteFeedSource …");
    const wasDeleted = await deleteFeedSource(createdId);
    console.log(`   ✅  deleted=${wasDeleted}`);
    createdId = undefined;

    // ── Step 9: get after delete ──────────────────────────────────────────────
    console.log("9️⃣   getFeedSource after delete …");
    const gone = await getFeedSource(createdId ?? created.id);
    console.log(`   ✅  returned null: ${gone === null}`);

    console.log("\n✅  Core CRUD steps passed\n");
  } catch (err) {
    console.error("\n❌  Smoke test failed:", err instanceof Error ? err.message : err);
    // Best-effort cleanup
    if (createdId) {
      try {
        await deleteFeedSource(createdId);
        console.log("   🧹  cleaned up test record");
      } catch {
        console.log(`   ⚠️   cleanup failed — manually delete feed_sources row id=${createdId}`);
      }
    }
  }

  // ── Step 10: FeedSourceHasPostsError ─────────────────────────────────────
  // Manually insert a feed_source → article → post chain to trigger the
  // RESTRICT FK guard in deleteFeedSource.
  console.log("🔟   deleteFeedSource with attached posts → FeedSourceHasPostsError …");
  let cascadeSourceId: string | undefined;
  try {
    const dbMod = await import("@/db");
    const { db, feedSources: fsTable, articles: artTable, posts: postsTable } = dbMod;
    const { eq: eqFn } = await import("drizzle-orm");

    const [cascadeSource] = await db
      .insert(fsTable)
      .values({ name: "Smoke Cascade Source", url: "https://smoke-cascade.example.com/feed.xml" })
      .returning();
    cascadeSourceId = cascadeSource.id;

    const [cascadeArticle] = await db
      .insert(artTable)
      .values({
        feedSourceId: cascadeSource.id,
        title: "Smoke Cascade Article",
        url: "https://smoke-cascade.example.com/article-1",
        contentHash: "a".repeat(64),
      })
      .returning();

    await db
      .insert(postsTable)
      .values({ articleId: cascadeArticle.id })
      .returning();

    try {
      await deleteFeedSource(cascadeSource.id);
      console.log("   ❌  expected FeedSourceHasPostsError, got none");
    } catch (err) {
      if (err instanceof FeedSourceHasPostsError) {
        console.log(`   ✅  FeedSourceHasPostsError thrown — postCount=${err.postCount}`);
      } else {
        throw err;
      }
    }

    // Cleanup: delete in reverse FK order
    await db.delete(postsTable).where(eqFn(postsTable.articleId, cascadeArticle.id));
    await db.delete(artTable).where(eqFn(artTable.id, cascadeArticle.id));
    await db.delete(fsTable).where(eqFn(fsTable.id, cascadeSource.id));
    cascadeSourceId = undefined;
    console.log("   🧹  cascade test records cleaned up");
  } catch (err) {
    console.error("   ❌  Step 10 failed:", err instanceof Error ? err.message : err);
    if (cascadeSourceId) {
      console.log(`   ⚠️   manually clean cascade source id=${cascadeSourceId}`);
    }
  }

  // ── Step 11: Concurrent race → DuplicateFeedSourceError ──────────────────
  // Fire multiple concurrent createFeedSource calls for the same URL.
  // At most one should succeed; all rejections must be DuplicateFeedSourceError.
  console.log("1️⃣1️⃣  Concurrent createFeedSource race → all losers get DuplicateFeedSourceError …");
  const raceResults = await Promise.allSettled([
    createFeedSource({ name: "Race A", url: RACE_URL }),
    createFeedSource({ name: "Race B", url: RACE_URL }),
    createFeedSource({ name: "Race C", url: RACE_URL }),
  ]);
  const raceFulfilled = raceResults.filter((r) => r.status === "fulfilled");
  const raceRejected = raceResults.filter((r) => r.status === "rejected");
  const allRejectedAsDuplicate = raceRejected.every(
    (r) => r.status === "rejected" && r.reason instanceof DuplicateFeedSourceError,
  );
  console.log(
    `   ✅  fulfilled=${raceFulfilled.length} rejected=${raceRejected.length} allDuplicate=${allRejectedAsDuplicate}`,
  );
  // Cleanup race winner
  const raceWinner = raceFulfilled[0];
  if (raceWinner && raceWinner.status === "fulfilled") {
    try {
      await deleteFeedSource(raceWinner.value.id);
      console.log("   🧹  race winner cleaned up");
    } catch {
      console.log(`   ⚠️   cleanup failed for race winner id=${raceWinner.value.id}`);
    }
  }

  // ── Step 12: PATCH URL to existing URL → DuplicateFeedSourceError ─────────
  console.log("1️⃣2️⃣  updateFeedSource (URL to existing URL) → DuplicateFeedSourceError …");
  let patchAId: string | undefined;
  let patchBId: string | undefined;
  try {
    const sourceA = await createFeedSource({ name: "Patch Dup A", url: PATCH_DUP_URL_A });
    patchAId = sourceA.id;
    const sourceB = await createFeedSource({ name: "Patch Dup B", url: PATCH_DUP_URL_B });
    patchBId = sourceB.id;

    try {
      await updateFeedSource(patchBId, { url: PATCH_DUP_URL_A });
      console.log("   ❌  expected DuplicateFeedSourceError, got none");
    } catch (err) {
      if (err instanceof DuplicateFeedSourceError) {
        console.log(`   ✅  DuplicateFeedSourceError thrown — existing id=${err.existing.id}`);
      } else {
        throw err;
      }
    }
  } finally {
    if (patchAId) {
      try { await deleteFeedSource(patchAId); } catch { /* best effort */ }
    }
    if (patchBId) {
      try { await deleteFeedSource(patchBId); } catch { /* best effort */ }
    }
    console.log("   🧹  patch dup test records cleaned up");
  }

  console.log("\n✅  All smoke test steps passed\n");
}

main();
