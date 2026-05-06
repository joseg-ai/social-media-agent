/**
 * Prompt management service layer — WI-10
 *
 * API contract for agents (WI-07/08/09) and the dashboard (WI-16).
 *
 * Design decisions:
 * - Every edit creates a new row (append-only versioning). No in-place updates.
 *   This gives Trinity's prompt editor (WI-16) a full audit trail and rollback.
 * - The "active" version is selected via an isActive flag, NOT "latest version
 *   always wins". Reason: auditability. After a bad prompt rollout Jose can
 *   flip back to v3 while v4 still exists in history. "Latest wins" would
 *   require deleting the bad version to roll back — that destroys the record.
 * - One active version per (name, promptType) pair at a time. Atomicity is
 *   enforced by wrapping deactivate + activate in a DB transaction.
 * - renderPrompt uses {{variable_name}} substitution — no template engine.
 *   Transparent and inspectable; consumers see exactly what the LLM receives.
 *
 * Consumers:
 *   import { getActivePrompt, renderPrompt } from "@/lib/prompts";
 *   const prompt = await getActivePrompt("relevance_scorer", "scoring");
 *   const text   = renderPrompt(prompt, { master_context: "...", article_title: "..." });
 */

import { and, desc, eq } from "drizzle-orm";
import { db, prompts } from "@/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptType = "scoring" | "drafting" | "timing";

export type Prompt = {
  id: string;
  name: string;
  promptType: PromptType;
  content: string;
  version: number;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
};

export type CreatePromptVersionInput = {
  name: string;
  promptType: PromptType;
  content: string;
  notes?: string;
  /**
   * When true (default), the new version becomes active immediately and the
   * prior active version is deactivated atomically. Set false to stage a
   * version without activating it — useful for draft editing before go-live.
   */
  activate?: boolean;
};

// ── Errors ────────────────────────────────────────────────────────────────────

export class PromptNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptNotFoundError";
  }
}

/**
 * Thrown by renderPrompt when the template references a variable not supplied
 * in the `vars` map. `missingVars` lists all unresolved placeholder names.
 */
export class PromptRenderError extends Error {
  readonly missingVars: string[];
  constructor(missing: string[]) {
    super(
      `renderPrompt: missing required variables: ${missing.map((k) => `{{${k}}}`).join(", ")}`
    );
    this.name = "PromptRenderError";
    this.missingVars = missing;
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the currently active version for a named prompt.
 *
 * @param name       Logical prompt name, e.g. "relevance_scorer"
 * @param promptType Category: "scoring" | "drafting" | "timing"
 * @throws PromptNotFoundError if no active version exists for that key
 */
export async function getActivePrompt(
  name: string,
  promptType: PromptType
): Promise<Prompt> {
  const rows = await db
    .select()
    .from(prompts)
    .where(
      and(
        eq(prompts.name, name),
        eq(prompts.promptType, promptType),
        eq(prompts.isActive, true)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new PromptNotFoundError(
      `No active prompt found for name="${name}" type="${promptType}"`
    );
  }
  return rows[0] as Prompt;
}

/**
 * Fetch a specific prompt version by its primary key (UUID).
 *
 * @throws PromptNotFoundError if not found
 */
export async function getPromptById(id: string): Promise<Prompt> {
  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, id))
    .limit(1);

  if (rows.length === 0) {
    throw new PromptNotFoundError(`No prompt found with id="${id}"`);
  }
  return rows[0] as Prompt;
}

/**
 * List all prompt rows across all versions and types, sorted by name → type →
 * version descending (newest first within each key).
 *
 * Used by the dashboard (WI-16) to render the full prompt list.
 */
export async function listPrompts(): Promise<Prompt[]> {
  const rows = await db
    .select()
    .from(prompts)
    .orderBy(prompts.name, prompts.promptType, desc(prompts.version));
  return rows as Prompt[];
}

/**
 * List all versions for a specific prompt key (name + promptType), newest first.
 *
 * Used by the dashboard (WI-16) to render version history and allow rollback.
 */
export async function listPromptHistory(
  name: string,
  promptType: PromptType
): Promise<Prompt[]> {
  const rows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.promptType, promptType)))
    .orderBy(desc(prompts.version));
  return rows as Prompt[];
}


export type PromptKeySummary = {
  name: string;
  promptType: PromptType;
  activeVersion: number | null;
  totalVersions: number;
  notes: string | null;
};

export async function listAllPromptKeys(): Promise<PromptKeySummary[]> {
  const all = await listPrompts();
  const map = new Map<string, PromptKeySummary>();
  for (const row of all) {
    const k = row.name + "::" + row.promptType;
    if (!map.has(k)) {
      map.set(k, { name: row.name, promptType: row.promptType, activeVersion: null, totalVersions: 0, notes: null });
    }
    const entry = map.get(k)!;
    entry.totalVersions += 1;
    if (row.isActive) { entry.activeVersion = row.version; entry.notes = row.notes; }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPromptByNameAndVersion(name: string, version: number): Promise<Prompt> {
  const rows = await db.select().from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.version, version))).limit(1);
  if (rows.length === 0) throw new PromptNotFoundError(`No prompt found for name="${name}" version=${version}`);
  return rows[0] as Prompt;
}

export async function getActivePromptByName(name: string): Promise<Prompt> {
  const rows = await db.select().from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.isActive, true))).limit(1);
  if (rows.length === 0) throw new PromptNotFoundError(`No active prompt found for name="${name}"`);
  return rows[0] as Prompt;
}

export async function listPromptHistoryByName(name: string): Promise<Prompt[]> {
  const rows = await db.select().from(prompts)
    .where(eq(prompts.name, name)).orderBy(desc(prompts.version));
  return rows as Prompt[];
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new version for a prompt key.
 *
 * Auto-increments version number based on the highest existing version for
 * that (name, promptType). If activate=true (default), the prior active
 * version is deactivated and the new version is activated — atomically in a
 * single transaction.
 *
 * This is the only mutation path for prompt content. There is no "update in
 * place" — every change produces a new row. Trinity's dashboard calls this
 * whenever Jose edits a prompt.
 */
export async function createPromptVersion(
  input: CreatePromptVersionInput
): Promise<Prompt> {
  const { name, promptType, content, notes, activate = true } = input;

  const history = await listPromptHistory(name, promptType);
  const nextVersion = history.length > 0 ? history[0].version + 1 : 1;

  return db.transaction(async (tx) => {
    if (activate && history.length > 0) {
      await tx
        .update(prompts)
        .set({ isActive: false })
        .where(
          and(
            eq(prompts.name, name),
            eq(prompts.promptType, promptType),
            eq(prompts.isActive, true)
          )
        );
    }

    const [created] = await tx
      .insert(prompts)
      .values({
        name,
        promptType,
        content,
        version: nextVersion,
        isActive: activate,
        notes: notes ?? null,
      })
      .returning();

    return created as Prompt;
  });
}

/**
 * Activate a specific prompt version by ID, rolling back to it if needed.
 *
 * Atomically deactivates all other active versions for the same (name,
 * promptType) and marks the target version active.
 *
 * Rollback pattern:
 *   const history = await listPromptHistory("relevance_scorer", "scoring");
 *   await activatePromptVersion(history[2].id); // activate v3 while v5 exists
 */
export async function activatePromptVersion(id: string): Promise<void> {
  const target = await getPromptById(id);

  await db.transaction(async (tx) => {
    await tx
      .update(prompts)
      .set({ isActive: false })
      .where(
        and(
          eq(prompts.name, target.name),
          eq(prompts.promptType, target.promptType),
          eq(prompts.isActive, true)
        )
      );

    await tx
      .update(prompts)
      .set({ isActive: true })
      .where(eq(prompts.id, id));
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Interpolate {{placeholder}} variables into a prompt template and return the
 * fully rendered string ready to send to the LLM.
 *
 * Placeholder syntax: {{variable_name}}
 * - Variable names: word characters only (a–z, A–Z, 0–9, underscore).
 * - Case-sensitive: {{Article_Title}} !== {{article_title}}.
 * - Every placeholder in the template MUST have a corresponding value in `vars`.
 *   Throws PromptRenderError listing all missing variables.
 * - Extra keys in `vars` that don't appear in the template are silently ignored.
 *
 * The {{master_context}} variable is the primary customization hook — it
 * carries Jose's interest profile, voice guidelines, and any system-level
 * context. Agents supply it at call time; Trinity's dashboard manages the value.
 *
 * @example
 *   const rendered = renderPrompt(prompt, {
 *     master_context: "You are Jose's Azure expert...",
 *     article_title:  "Announcing Azure AI Foundry",
 *     article_url:    "https://azure.microsoft.com/...",
 *     article_summary: "Azure AI Foundry is...",
 *     feed_name:      "Microsoft Azure Blog",
 *   });
 */
export function renderPrompt(
  prompt: Prompt,
  vars: Record<string, string>
): string {
  const missing: string[] = [];

  const rendered = prompt.content.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => {
      if (!(key in vars)) {
        missing.push(key);
        return `{{${key}}}`;
      }
      return vars[key];
    }
  );

  if (missing.length > 0) {
    throw new PromptRenderError(missing);
  }

  return rendered;
}
