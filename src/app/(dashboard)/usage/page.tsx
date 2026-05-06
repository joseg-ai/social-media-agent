/**
 * /usage — Token/cost dashboard page (WI-17)
 *
 * Server Component. Fetches data directly from the lib layer (no API round-trip
 * for the initial SSR render). The /api/usage route is available for client-side
 * refresh if needed in future.
 */
import { type SearchParams } from "next/dist/server/request/search-params";
import { getUsageInRange, listRecentCalls } from "@/lib/llm/usage";
import { estimateCostUsd } from "@/lib/llm/pricing";

export const dynamic = "force-dynamic";

// ── Range helpers ─────────────────────────────────────────────────────────────

type Range = "today" | "7d" | "30d" | "month";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
];

function parseRange(raw: unknown): Range {
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

// ── Tiny utilities ────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m!, 10) - 1]} ${parseInt(d!, 10)}`;
}

function truncateId(id: string): string {
  return id.slice(0, 8) + "…";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
        {value}
      </p>
      {sub && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

interface DayBucket {
  date: string;
  total_tokens: number;
  call_count: number;
  estimated_cost_usd: number;
}

function DailyBarChart({ days }: { days: DayBucket[] }) {
  if (days.length === 0) return null;
  const maxTokens = Math.max(...days.map((d) => d.total_tokens), 1);

  return (
    <div className="space-y-1.5">
      {days.map((day) => {
        const pct = Math.max(
          (day.total_tokens / maxTokens) * 100,
          day.total_tokens > 0 ? 2 : 0,
        );
        return (
          <div key={day.date} className="flex items-center gap-3 group">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-12 shrink-0 text-right">
              {fmtDate(day.date)}
            </span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded transition-all"
                style={{ width: `${pct}%` }}
                title={`${fmtTokens(day.total_tokens)} tokens · ${day.call_count} calls · ${fmtCost(day.estimated_cost_usd)}`}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0 text-right tabular-nums">
              {fmtTokens(day.total_tokens)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const { start, end } = rangeToWindow(range);

  const [rows, recentCalls] = await Promise.all([
    getUsageInRange(start, end),
    listRecentCalls(50),
  ]);

  const isEmpty = rows.length === 0 && recentCalls.length === 0;

  // ── Aggregate ──
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const dayMap = new Map<string, DayBucket>();
  const modelMap = new Map<
    string,
    { model: string; total_tokens: number; call_count: number; estimated_cost_usd: number }
  >();

  for (const row of rows) {
    const cost = estimateCostUsd(row.model, row.promptTokens, row.completionTokens);
    totalPrompt += row.promptTokens;
    totalCompletion += row.completionTokens;
    totalTokens += row.totalTokens;
    totalCost += cost;

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

    const m = modelMap.get(row.model) ?? {
      model: row.model,
      total_tokens: 0,
      call_count: 0,
      estimated_cost_usd: 0,
    };
    m.total_tokens += row.totalTokens;
    m.call_count += 1;
    m.estimated_cost_usd += cost;
    modelMap.set(row.model, m);
  }

  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const byModel = Array.from(modelMap.values()).sort(
    (a, b) => b.total_tokens - a.total_tokens,
  );
  const avgTokensPerCall =
    rows.length > 0 ? Math.round(totalTokens / rows.length) : 0;

  return (
    <div className="space-y-8">
      {/* ── Header + range selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Token Usage &amp; Cost
        </h1>
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {RANGE_OPTIONS.map(({ value, label }) => (
            <a
              key={value}
              href={`?range=${value}`}
              className={[
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                value === range
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100",
              ].join(" ")}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {isEmpty ? (
        /* ── Empty state ── */
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No LLM calls yet. Generate a draft or score an article to populate
            this view.
          </p>
        </div>
      ) : (
        <>
          {/* ── Metric tiles ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricTile
              label="Total tokens"
              value={fmtTokens(totalTokens)}
              sub={`${fmtTokens(totalPrompt)} prompt · ${fmtTokens(totalCompletion)} completion`}
            />
            <MetricTile label="Total calls" value={String(rows.length)} />
            <MetricTile
              label="Estimated cost"
              value={fmtCost(totalCost)}
              sub="Hardcoded pricing — see pricing.ts"
            />
            <MetricTile
              label="Avg tokens / call"
              value={fmtTokens(avgTokensPerCall)}
            />
          </div>

          {/* ── Per-day bar chart ── */}
          {byDay.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                Daily usage
              </h2>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <DailyBarChart days={byDay} />
              </div>
            </section>
          )}

          {/* ── Per-model table ── */}
          {byModel.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                By model
              </h2>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Model
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Calls
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Total tokens
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Est. cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {byModel.map((m) => (
                      <tr
                        key={m.model}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">
                          {m.model}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {m.call_count}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {fmtTokens(m.total_tokens)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {fmtCost(m.estimated_cost_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Recent calls table ── */}
          {recentCalls.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                Recent calls{" "}
                <span className="font-normal text-gray-400 normal-case">
                  (last {recentCalls.length})
                </span>
              </h2>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Time
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Model
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Prompt
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Completion
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        Latency
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">
                        ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {recentCalls.map((call) => (
                      <tr
                        key={call.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="px-4 py-2 tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                          {call.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {call.model}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {call.promptTokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {call.completionTokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                          {call.durationMs != null ? `${call.durationMs}ms` : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400 dark:text-gray-500">
                          {truncateId(call.id)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
