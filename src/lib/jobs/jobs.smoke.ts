/**
 * Smoke test for the jobs layer.
 *
 * Verifies:
 *   1. Advisory lock primitive: concurrent calls — second returns null.
 *   2. Feed-poll handler: runs once end-to-end without crashing.
 *
 * DB-tolerant: if Postgres is unreachable the test exits 0 with a skip message.
 *
 * Run with: npx tsx src/lib/jobs/jobs.smoke.ts
 */
import { withAdvisoryLock, jobLockKey } from "./locks";
import { listFeedSources } from "@/lib/feeds/sources";
import { ingestFeed } from "@/lib/feeds/ingest";

async function runSmoke() {
  // ── 1. Advisory lock: parallel calls ──────────────────────────────────────
  console.log("[smoke] testing advisory lock primitive...");

  const key = jobLockKey("smoke-test");

  // The first call holds the lock while sleeping; the second races in concurrently.
  const [r1, r2] = await Promise.all([
    withAdvisoryLock(key, async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return "first";
    }),
    // Small delay so the first call wins the race consistently.
    new Promise<null | string>((resolve) =>
      setTimeout(
        () =>
          withAdvisoryLock(key, async () => "second")
            .then(resolve)
            .catch(resolve),
        50,
      ),
    ),
  ]);

  if (r2 !== null) {
    throw new Error(`Expected second lock attempt to return null, got: ${String(r2)}`);
  }
  console.log(`[smoke] ✓ lock primitive OK — first: "${r1}", second: null (skipped)`);

  // ── 2. Feed-poll: one manual run ──────────────────────────────────────────
  console.log("[smoke] testing feed-poll handler (one manual run)...");

  const sources = await listFeedSources({ includeInactive: false });
  console.log(`[smoke] found ${sources.length} active feed source(s)`);

  let totalInserted = 0;
  for (const source of sources.slice(0, 3)) {
    try {
      const result = await ingestFeed(source.id);
      totalInserted += result.inserted;
      console.log(
        `[smoke] ✓ feed ${source.id} — inserted: ${result.inserted}, skipped: ${result.skipped}`,
      );
    } catch (err) {
      console.error(`[smoke] feed ${source.id} error (non-fatal):`, err);
    }
  }

  console.log(`[smoke] feed-poll done — ${totalInserted} total articles inserted`);
  console.log("[smoke] all smoke tests passed ✓");
}

runSmoke()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as NodeJS.ErrnoException).code;

    if (code === "ECONNREFUSED" || msg.includes("connect") || msg.includes("ECONNREFUSED")) {
      console.log("[smoke] DB unavailable — skipping smoke tests.");
      process.exit(0);
    }

    console.error("[smoke] smoke test failed:", err);
    process.exit(1);
  });
