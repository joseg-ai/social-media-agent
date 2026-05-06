/**
 * /prompts — Prompt keys list page (WI-16)
 *
 * Server Component. Fetches all prompt keys directly from the DB (no API
 * round-trip for SSR). Each card links to /prompts/[key] for editing.
 */
import Link from "next/link";
import { listAllPromptKeys } from "@/lib/prompts";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompts — Social Media Agent",
};

const PROMPT_DESCRIPTIONS: Record<string, string> = {
  relevance_scorer: "Rate articles 0.0–1.0 for LinkedIn relevance and topic value.",
  timing_advisor: "Recommend optimal LinkedIn post time with engagement rationale.",
  draft_generator: "Generate a full LinkedIn post from an article URL and summary.",
};

const TYPE_LABELS: Record<string, string> = {
  scoring: "Scoring",
  drafting: "Drafting",
  timing: "Timing",
};

export default async function PromptsPage() {
  const keys = await listAllPromptKeys();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">LLM Prompts</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          View and edit the prompts that drive scoring, timing, and draft
          generation. Every save creates a new version — prior versions are
          never deleted.
        </p>
      </div>

      {keys.length === 0 ? (
        <EmptyState />
      ) : (
        <PromptGrid keys={keys} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        No prompts found.{" "}
        <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          npm run db:seed-prompts
        </code>{" "}
        to seed the defaults.
      </p>
    </div>
  );
}

function PromptGrid({
  keys,
}: {
  keys: Awaited<ReturnType<typeof listAllPromptKeys>>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((prompt) => (
        <div
          key={prompt.name}
          className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 gap-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate font-mono">
                {prompt.name}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {PROMPT_DESCRIPTIONS[prompt.name] ?? prompt.notes ?? "—"}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {TYPE_LABELS[prompt.promptType] ?? prompt.promptType}
            </span>
          </div>

          {/* Version info */}
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
              Active:{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                v{prompt.activeVersion ?? "—"}
              </span>
            </span>
            <span>
              Versions:{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {prompt.totalVersions}
              </span>
            </span>
          </div>

          {/* Edit button */}
          <div className="mt-auto pt-1">
            <Link
              href={`/prompts/${prompt.name}`}
              className="inline-flex items-center justify-center w-full rounded-md px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              Edit
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
