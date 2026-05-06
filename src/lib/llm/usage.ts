/**
 * Aggregation helpers for the llm_calls table (WI-18).
 * Powers the token/cost dashboard (WI-17) and API routes.
 */
import { db } from "@/db";
import { llmCalls } from "@/db/schema";
import { and, gte, lte, sum, count, desc } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LlmCallRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number | null;
  createdAt: Date;
}

export interface TokenTotals {
  prompt: number;
  completion: number;
  total: number;
  calls: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all llm_calls rows whose createdAt falls within [start, end] inclusive.
 */
export async function getUsageInRange(
  start: Date,
  end: Date,
): Promise<LlmCallRow[]> {
  const rows = await db
    .select({
      id: llmCalls.id,
      model: llmCalls.model,
      promptTokens: llmCalls.promptTokens,
      completionTokens: llmCalls.completionTokens,
      totalTokens: llmCalls.totalTokens,
      durationMs: llmCalls.durationMs,
      createdAt: llmCalls.createdAt,
    })
    .from(llmCalls)
    .where(and(gte(llmCalls.createdAt, start), lte(llmCalls.createdAt, end)));

  return rows;
}

/**
 * Aggregate token counts for calls within [start, end].
 * Returns zeroed totals when no rows exist.
 */
export async function getTotalTokensInRange(
  start: Date,
  end: Date,
): Promise<TokenTotals> {
  const [row] = await db
    .select({
      prompt: sum(llmCalls.promptTokens),
      completion: sum(llmCalls.completionTokens),
      total: sum(llmCalls.totalTokens),
      calls: count(llmCalls.id),
    })
    .from(llmCalls)
    .where(and(gte(llmCalls.createdAt, start), lte(llmCalls.createdAt, end)));

  return {
    prompt: Number(row?.prompt ?? 0),
    completion: Number(row?.completion ?? 0),
    total: Number(row?.total ?? 0),
    calls: Number(row?.calls ?? 0),
  };
}

/**
 * Return the N most-recent llm_calls rows, newest first.
 * Used by the /usage dashboard to show the recent calls table.
 */
export async function listRecentCalls(limit = 50): Promise<LlmCallRow[]> {
  return db
    .select({
      id: llmCalls.id,
      model: llmCalls.model,
      promptTokens: llmCalls.promptTokens,
      completionTokens: llmCalls.completionTokens,
      totalTokens: llmCalls.totalTokens,
      durationMs: llmCalls.durationMs,
      createdAt: llmCalls.createdAt,
    })
    .from(llmCalls)
    .orderBy(desc(llmCalls.createdAt))
    .limit(limit);
}
