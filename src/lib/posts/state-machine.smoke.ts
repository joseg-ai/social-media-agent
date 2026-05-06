/**
 * State machine smoke test — WI-11
 *
 * Tests:
 *   1. Happy path: draft → scheduled → posting → posted
 *   2. Invalid transition (posted → draft) throws InvalidStateTransitionError
 *   3. Race test: 5 parallel claimForPosting calls on the same post → exactly 1 wins
 *
 * DB-tolerant: if DATABASE_URL is missing or the DB is unreachable, all tests
 * are skipped gracefully so CI without Postgres passes.
 *
 * Run:  npx tsx src/lib/posts/state-machine.smoke.ts
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, feedSources, posts } from "@/db/schema";
import {
  approveDraft,
  claimForPosting,
  InvalidStateTransitionError,
  markFailed,
  markPosted,
  retryFailed,
  transitionPost,
} from "./state-machine";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let skipped = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  } else {
    console.log(`  ✓ ${label}`);
    passed++;
  }
}

async function isDbAvailable(): Promise<boolean> {
  try {
    await db.execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedFeedSource(): Promise<string> {
  const tag = `smoke-${Date.now()}`;
  const rows = await db
    .insert(feedSources)
    .values({ name: `Smoke ${tag}`, url: `https://smoke.test/${tag}` })
    .returning({ id: feedSources.id });
  return rows[0]!.id;
}

async function seedArticle(feedSourceId: string): Promise<string> {
  const tag = `smoke-${Date.now()}`;
  const rows = await db
    .insert(articles)
    .values({
      feedSourceId,
      title: `Smoke Article ${tag}`,
      url: `https://smoke.test/article/${tag}`,
      contentHash: `hash-${tag}`,
      status: "scored",
    })
    .returning({ id: articles.id });
  return rows[0]!.id;
}

async function seedDraftPost(articleId: string): Promise<string> {
  const rows = await db
    .insert(posts)
    .values({ articleId, state: "draft", draftText: "Smoke test draft." })
    .returning({ id: posts.id });
  return rows[0]!.id;
}

async function cleanUp(
  postId: string,
  articleId: string,
  feedSourceId: string,
) {
  await db.delete(posts).where(eq(posts.id, postId));
  await db.delete(articles).where(eq(articles.id, articleId));
  await db.delete(feedSources).where(eq(feedSources.id, feedSourceId));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testHappyPath() {
  console.log("\nTest 1: happy path (draft → scheduled → posting → posted)");
  const feedId = await seedFeedSource();
  const articleId = await seedArticle(feedId);
  const postId = await seedDraftPost(articleId);

  try {
    let post = await approveDraft(postId, { schedule_for: new Date() });
    assert(post.state === "scheduled", "state is scheduled after approveDraft");

    post = await claimForPosting(postId);
    assert(post.state === "posting", "state is posting after claimForPosting");

    post = await markPosted(postId, "urn:li:share:smoke123");
    assert(post.state === "posted", "state is posted after markPosted");
    assert(
      post.linkedinPostId === "urn:li:share:smoke123",
      "linkedin_post_id set",
    );
    assert(post.postedAt !== null, "posted_at set");
  } finally {
    await cleanUp(postId, articleId, feedId);
  }
}

async function testFailedRetryPath() {
  console.log("\nTest 2: failure + retry path (posting → failed → scheduled)");
  const feedId = await seedFeedSource();
  const articleId = await seedArticle(feedId);
  const postId = await seedDraftPost(articleId);

  try {
    await approveDraft(postId, { schedule_for: new Date() });
    await claimForPosting(postId);

    let post = await markFailed(postId, "LinkedIn 429 Too Many Requests");
    assert(post.state === "failed", "state is failed after markFailed");
    assert(post.failureCount === 1, "failure_count incremented to 1");
    assert(
      post.failureReason === "LinkedIn 429 Too Many Requests",
      "failure_reason set",
    );

    post = await retryFailed(postId, { schedule_for: new Date() });
    assert(post.state === "scheduled", "state is scheduled after retryFailed");
  } finally {
    await cleanUp(postId, articleId, feedId);
  }
}

async function testInvalidTransition() {
  console.log("\nTest 3: invalid transition (posted → draft) throws");
  const feedId = await seedFeedSource();
  const articleId = await seedArticle(feedId);
  const postId = await seedDraftPost(articleId);

  try {
    await approveDraft(postId, { schedule_for: new Date() });
    await claimForPosting(postId);
    await markPosted(postId, "urn:li:share:smoke456");

    let threw = false;
    try {
      await transitionPost(postId, "posted", "draft");
    } catch (err) {
      threw = err instanceof InvalidStateTransitionError;
    }
    assert(threw, "throws InvalidStateTransitionError for posted → draft");
  } finally {
    await cleanUp(postId, articleId, feedId);
  }
}

async function testRaceCondition() {
  console.log(
    "\nTest 4: race — 5 parallel claimForPosting calls, exactly 1 wins",
  );
  const feedId = await seedFeedSource();
  const articleId = await seedArticle(feedId);
  const postId = await seedDraftPost(articleId);

  try {
    await approveDraft(postId, { schedule_for: new Date() });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => claimForPosting(postId)),
    );

    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => {
      if (r.status === "rejected") {
        return r.reason instanceof InvalidStateTransitionError;
      }
      return false;
    }).length;

    assert(successes === 1, `exactly 1 worker claimed the post (got ${successes})`);
    assert(failures === 4, `4 workers got InvalidStateTransitionError (got ${failures})`);
  } finally {
    // Verify post is in posting state, then clean up
    const rows = await db
      .select({ state: posts.state })
      .from(posts)
      .where(eq(posts.id, postId));
    if (rows[0]) {
      assert(rows[0].state === "posting", "post ended in posting state");
    }
    await cleanUp(postId, articleId, feedId);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Post state machine smoke test ===");

  const available = await isDbAvailable();
  if (!available) {
    console.log("⚠ Database unavailable — skipping all tests.");
    skipped++;
    process.exit(0);
  }

  try {
    await testHappyPath();
    await testFailedRetryPath();
    await testInvalidTransition();
    await testRaceCondition();
  } catch (err) {
    console.error("\nUnexpected error:", err);
    failed++;
  }

  console.log(
    `\n=== Results: ${passed} passed, ${skipped} skipped, ${failed} failed ===`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
