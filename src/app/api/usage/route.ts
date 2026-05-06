/**
 * GET /api/usage?range=7d|30d|today|month
 *
 * Returns aggregated token/cost data for the usage dashboard (WI-17).
 * Auth is handled globally by the middleware — no additional check needed here.
 *
 * ⚠️  Pricing is hardcoded in src/lib/llm/pricing.ts and should be reviewed
 *     periodically as model pricing changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUsageInRange } from "@/lib/llm/usage";
import { estimateCostUsd } from "@/lib/llm/pricing";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsageTotals {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  call_count: number;
}

export interface DayBucket {
  date: string; // "YYYY-MM-DD"
  total_tokens: number;
  call_count: number;
  estimated_cost_usd: number;
}

export interface ModelBucket {
  model: string;
  total_tokens: number;
  call_count: number;
  estimated_cost_usd: number;
}

export interface UsageResponse {
  range: string;
  total: UsageTotals;
  byDay: DayBucket[];
  byModel: ModelBucket[];
}

// ── Range helpers ─────────────────────────────────────────────────────────────

type Range = "today" | "7d" | "30d" | "month";

function parseRange(raw: string | null): Range {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "month") {
    return raw;
  }
  return "7d";
}

function rangeToWindow(range: Range): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);

  switch (range) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const { start, end } = rangeToWindow(range);

    const rows = await getUsageInRange(start, end);

    // ── Totals ──
    const total: UsageTotals = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
      call_count: rows.length,
    };

    const dayMap = new Map<string, DayBucket>();
    const modelMap = new Map<string, ModelBucket>();

    for (const row of rows) {
      const cost = estimateCostUsd(row.model, row.promptTokens, row.completionTokens);

      // Totals
      total.prompt_tokens += row.promptTokens;
      total.completion_tokens += row.completionTokens;
      total.total_tokens += row.totalTokens;
      total.estimated_cost_usd += cost;

      // Per-day
      const dateKey = row.createdAt.toISOString().slice(0, 10);
      const day = dayMap.get(dateKey) ?? {
        date: dateKey,
        total_tokens: 0,
        call_count: 0,
        estimated_cost_usd: 0,
      };
      day.total_tokens += row.totalTokens;
      day.call_count += 1;
      day.estimated_cost_usd += cost;
      dayMap.set(dateKey, day);

      // Per-model
      const model = modelMap.get(row.model) ?? {
        model: row.model,
        total_tokens: 0,
        call_count: 0,
        estimated_cost_usd: 0,
      };
      model.total_tokens += row.totalTokens;
      model.call_count += 1;
      model.estimated_cost_usd += cost;
      modelMap.set(row.model, model);
    }

    // Sort byDay ascending, byModel descending by tokens
    const byDay = Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const byModel = Array.from(modelMap.values()).sort(
      (a, b) => b.total_tokens - a.total_tokens,
    );

    // Round cost to 6 decimal places to avoid floating-point noise
    total.estimated_cost_usd = Math.round(total.estimated_cost_usd * 1e6) / 1e6;
    for (const d of byDay) d.estimated_cost_usd = Math.round(d.estimated_cost_usd * 1e6) / 1e6;
    for (const m of byModel) m.estimated_cost_usd = Math.round(m.estimated_cost_usd * 1e6) / 1e6;

    const body: UsageResponse = { range, total, byDay, byModel };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[GET /api/usage]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
