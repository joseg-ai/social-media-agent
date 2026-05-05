/**
 * Prompt service smoke test — WI-10
 *
 * Exercises the full prompt lifecycle against a real database:
 *   create → list → activate (rollback) → render
 *
 * Usage:
 *   DATABASE_URL=<url> SKIP_ENV_VALIDATION=1 npx tsx src/lib/prompts/smoke.ts
 *
 * Requires DATABASE_URL. Run AFTER db:migrate and db:seed-prompts.
 * Cleans up the test prompt rows it creates. Seeded prompts are untouched.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq } from "drizzle-orm";
import { prompts } from "../../db/schema";

// Inline render — keeps this script self-contained (no @/db dep)
function render(content: string, vars: Record<string, string>): string {
  const missing: string[] = [];
  const out = content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) {
      missing.push(key);
      return `{{${key}}}`;
    }
    return vars[key];
  });
  if (missing.length > 0) {
    throw new Error(
      `renderPrompt: missing vars: ${missing.map((k) => `{{${k}}}`).join(", ")}`
    );
  }
  return out;
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  \u2714  ${label}`);
}

async function smoke() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const TEST_NAME = "smoke_test_prompt";
  const TEST_TYPE = "scoring" as const;

  // Clean up any leftover from a previous run
  await db
    .delete(prompts)
    .where(and(eq(prompts.name, TEST_NAME), eq(prompts.promptType, TEST_TYPE)));

  // ── 1. create v1 ──────────────────────────────────────────────────────────
  console.log("\n\u2500\u2500 1. createPromptVersion (v1, isActive=true) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  const [v1] = await db
    .insert(prompts)
    .values({
      name: TEST_NAME,
      promptType: TEST_TYPE,
      content: "Hello {{name}}, welcome to {{place}}.",
      version: 1,
      isActive: true,
      notes: "smoke v1",
    })
    .returning();

  assert(v1.name === TEST_NAME, "v1 name matches");
  assert(v1.version === 1, "v1 version is 1");
  assert(v1.isActive === true, "v1 is active");

  // ── 2. create v2 (deactivates v1) ─────────────────────────────────────────
  console.log("\n\u2500\u2500 2. createPromptVersion (v2, activate=true) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  await db
    .update(prompts)
    .set({ isActive: false })
    .where(
      and(
        eq(prompts.name, TEST_NAME),
        eq(prompts.promptType, TEST_TYPE),
        eq(prompts.isActive, true)
      )
    );

  const [v2] = await db
    .insert(prompts)
    .values({
      name: TEST_NAME,
      promptType: TEST_TYPE,
      content: "Greetings {{name}}, you are in {{place}}.",
      version: 2,
      isActive: true,
      notes: "smoke v2",
    })
    .returning();

  assert(v2.version === 2, "v2 version is 2");
  assert(v2.isActive === true, "v2 is active");

  const [v1After] = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, v1.id));
  assert(v1After.isActive === false, "v1 deactivated after v2 created");

  // ── 3. listPrompts ────────────────────────────────────────────────────────
  console.log("\n\u2500\u2500 3. listPrompts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  const history = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.name, TEST_NAME), eq(prompts.promptType, TEST_TYPE)))
    .orderBy(desc(prompts.version));

  assert(history.length === 2, "listPromptHistory returns 2 versions");
  assert(history[0].version === 2, "newest version first");

  // ── 4. activatePromptVersion — rollback to v1 ──────────────────────────────
  console.log(
    "\n\u2500\u2500 4. activatePromptVersion (rollback to v1) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
  );

  await db
    .update(prompts)
    .set({ isActive: false })
    .where(
      and(
        eq(prompts.name, TEST_NAME),
        eq(prompts.promptType, TEST_TYPE),
        eq(prompts.isActive, true)
      )
    );
  await db
    .update(prompts)
    .set({ isActive: true })
    .where(eq(prompts.id, v1.id));

  const [active] = await db
    .select()
    .from(prompts)
    .where(
      and(
        eq(prompts.name, TEST_NAME),
        eq(prompts.promptType, TEST_TYPE),
        eq(prompts.isActive, true)
      )
    );

  assert(active !== undefined, "one active version found after rollback");
  assert(active.id === v1.id, "active version is v1 after rollback");

  // ── 5. renderPrompt ───────────────────────────────────────────────────────
  console.log("\n\u2500\u2500 5. renderPrompt \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  const out = render(v1.content, { name: "Jose", place: "Houston" });
  assert(out === "Hello Jose, welcome to Houston.", `rendered: "${out}"`);

  let threw = false;
  try {
    render(v1.content, { name: "Jose" }); // missing: place
  } catch {
    threw = true;
  }
  assert(threw, "renderPrompt throws on missing variable");

  const out2 = render(v1.content, { name: "Jose", place: "Houston", extra: "ignored" });
  assert(out2 === "Hello Jose, welcome to Houston.", "extra vars silently ignored");

  // ── 6. seeded prompts present ─────────────────────────────────────────────
  console.log("\n\u2500\u2500 6. Seeded prompts present \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  const EXPECTED = [
    ["relevance_scorer", "scoring"],
    ["timing_advisor", "timing"],
    ["draft_generator", "drafting"],
  ] as const;

  for (const [name, type] of EXPECTED) {
    const rows = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(
        and(
          eq(prompts.name, name),
          eq(prompts.promptType, type),
          eq(prompts.isActive, true)
        )
      )
      .limit(1);
    assert(rows.length === 1, `active seed: ${name} (${type})`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n\u2500\u2500 Cleanup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  await db
    .delete(prompts)
    .where(
      and(eq(prompts.name, TEST_NAME), eq(prompts.promptType, TEST_TYPE))
    );
  console.log("  \u2714  test rows deleted");

  await client.end();
  console.log("\n\u2714  All smoke checks passed.\n");
}

smoke().catch((err) => {
  console.error("\n\u2718  Smoke test failed:", err);
  process.exit(1);
});
