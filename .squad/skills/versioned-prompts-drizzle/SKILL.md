# SKILL: Versioned Prompt Management with Drizzle ORM

## Context

When you need LLM prompts to be editable at runtime (not hardcoded), versionable (full history, rollback), and consumed by multiple agents, you need a service layer over a `prompts` table. This pattern comes up in any agentic system where the prompt *is* the configuration.

---

## Schema pattern (Drizzle)

```typescript
export const promptTypeEnum = pgEnum("prompt_type", ["scoring", "drafting", "timing"]);

export const prompts = pgTable("prompts", {
  id:         uuid("id").defaultRandom().primaryKey(),
  name:       varchar("name", { length: 100 }).notNull(),   // logical key
  promptType: promptTypeEnum("prompt_type").notNull(),
  content:    text("content").notNull(),
  version:    integer("version").notNull().default(1),
  isActive:   boolean("is_active").notNull().default(true),
  notes:      text("notes"),                                 // changelog note
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("prompts_name_type_idx").on(t.name, t.promptType),
  index("prompts_type_active_idx").on(t.promptType, t.isActive),
]);
```

**Key points:**
- No `updatedAt` — rows are append-only (immutable once written)
- `isActive` is application-enforced, not a DB constraint, to allow atomic swaps
- Composite index on `(name, promptType)` for history queries
- Composite index on `(promptType, isActive)` for active-version lookups

---

## Why isActive flag, NOT "latest version always wins"

| Approach | Rollback UX | Audit trail |
|----------|-------------|-------------|
| Latest wins | Must delete the bad row | Destroyed |
| `isActive` flag | Flip two booleans in a transaction | Preserved |

Rollback = `UPDATE SET isActive=false WHERE isActive=true` + `UPDATE SET isActive=true WHERE id=target` — both in one transaction.

---

## Service layer pattern

### Active-version fetch

```typescript
export async function getActivePrompt(name: string, promptType: PromptType): Promise<Prompt> {
  const rows = await db
    .select().from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.promptType, promptType), eq(prompts.isActive, true)))
    .limit(1);
  if (rows.length === 0) throw new PromptNotFoundError(`No active prompt: name="${name}" type="${promptType}"`);
  return rows[0] as Prompt;
}
```

### Append-only versioning

```typescript
export async function createPromptVersion(input: CreatePromptVersionInput): Promise<Prompt> {
  const { name, promptType, content, notes, activate = true } = input;
  const history = await listPromptHistory(name, promptType);
  const nextVersion = history.length > 0 ? history[0].version + 1 : 1;

  return db.transaction(async (tx) => {
    if (activate && history.length > 0) {
      await tx.update(prompts).set({ isActive: false })
        .where(and(eq(prompts.name, name), eq(prompts.promptType, promptType), eq(prompts.isActive, true)));
    }
    const [created] = await tx.insert(prompts)
      .values({ name, promptType, content, version: nextVersion, isActive: activate, notes: notes ?? null })
      .returning();
    return created as Prompt;
  });
}
```

### Rollback

```typescript
export async function activatePromptVersion(id: string): Promise<void> {
  const target = await getPromptById(id);
  await db.transaction(async (tx) => {
    await tx.update(prompts).set({ isActive: false })
      .where(and(eq(prompts.name, target.name), eq(prompts.promptType, target.promptType), eq(prompts.isActive, true)));
    await tx.update(prompts).set({ isActive: true }).where(eq(prompts.id, id));
  });
}
```

---

## Template rendering pattern (no template engine)

```typescript
// Syntax: {{variable_name}} — word chars only, case-sensitive
export function renderPrompt(prompt: Prompt, vars: Record<string, string>): string {
  const missing: string[] = [];
  const rendered = prompt.content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) { missing.push(key); return `{{${key}}}`; }
    return vars[key];
  });
  if (missing.length > 0) throw new PromptRenderError(missing);
  return rendered;
}
```

**Why no template engine:** Prompt content is inspectable as plain text. Operators can read exactly what the LLM receives without knowing Handlebars/Jinja. Missing var detection is immediate and explicit.

**{{master_context}} convention:** Reserve one variable as the "primary customization hook" — it carries the user's interest profile, voice guidelines, and system context. Agents supply it at render time; users edit it via a dashboard. All other vars are article/request-specific.

---

## Idempotent seed script pattern

```typescript
// Only inserts if no active version exists — safe to run repeatedly
for (const seed of SEEDS) {
  const existing = await db.select({ id: prompts.id }).from(prompts)
    .where(and(eq(prompts.name, seed.name), eq(prompts.promptType, seed.promptType), eq(prompts.isActive, true)))
    .limit(1);
  if (existing.length > 0) { console.log(`- Skipped ${seed.name}`); continue; }
  await db.insert(prompts).values({ ...seed, version: 1, isActive: true });
  console.log(`✔ Seeded ${seed.name}`);
}
```

**Standalone DB connection for seed/smoke scripts:** To avoid triggering full app env validation (`DATABASE_URL` only):
```typescript
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
// ... use db directly, no @/db import
await client.end();
```

---

## Consumer usage

```typescript
import { getActivePrompt, renderPrompt } from "@/lib/prompts";

const prompt = await getActivePrompt("relevance_scorer", "scoring");
const text = renderPrompt(prompt, {
  master_context: settings.masterContext,
  article_title: article.title,
  article_summary: article.summary,
  article_url: article.url,
  feed_name: article.feedName,
});
// → ready to pass to LLM chat()
```

---

## Verified in

- Drizzle ORM v0.45.2, postgres driver v3.4.9, Next.js 15.5.3, TypeScript 5 strict mode
- `npx tsc --noEmit` ✓  `npm run lint` ✓
- See PR #8: `squad/wi-10-prompt-management` — social-media-agent
