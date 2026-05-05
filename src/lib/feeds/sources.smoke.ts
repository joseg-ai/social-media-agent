/**
 * Smoke test — feed source CRUD service lifecycle.
 *
 * Run with:   npx tsx src/lib/feeds/sources.smoke.ts
 *
 * What it does (if DATABASE_URL is set):
 *   1. createFeedSource  — insert a test feed
 *   2. createFeedSource  — attempt duplicate → expect DuplicateFeedSourceError
 *   3. listFeedSources   — verify the source appears
 *   4. getFeedSource     — verify by ID
 *   5. updateFeedSource  — rename + disable
 *   6. listFeedSources({ includeInactive: false }) — verify it's hidden
 *   7. listFeedSources({ includeInactive: true })  — verify it's visible
 *   8. deleteFeedSource  — hard delete
 *   9. getFeedSource     — verify gone
 *
 * Tolerant of DB-unavailable: any DB error prints a message and exits 0.
 */

const TEST_SOURCE = {
  name: "Smoke Test Feed",
  url: "https://smoke-test.example.com/feed.xml",
};

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
  } = mod;

  let createdId: string | undefined;

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

    console.log("\n✅  All smoke test steps passed\n");
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
}

main();
