/**
 * /prompts/[key] — Prompt detail + editor page (WI-16)
 *
 * Server Component. Fetches active version + full history server-side.
 * ?version=N query param selects a historical version to view.
 *
 * Layout:
 *   - Left: editor (PromptEditor client component)
 *   - Right: version history sidebar (clickable links)
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getPromptByNameAndVersion,
  listPromptHistoryByName,
  PromptNotFoundError,
} from "@/lib/prompts";
import { PromptEditor } from "./_components/PromptEditor";

export const dynamic = "force-dynamic";

const PROMPT_DESCRIPTIONS: Record<string, string> = {
  relevance_scorer: "Rate articles 0.0–1.0 for LinkedIn relevance and topic value.",
  timing_advisor: "Recommend optimal LinkedIn post time with engagement rationale.",
  draft_generator: "Generate a full LinkedIn post from an article URL and summary.",
};

type PageProps = {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ version?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key} — Prompts — Social Media Agent` };
}

export default async function PromptDetailPage({ params, searchParams }: PageProps) {
  const { key } = await params;
  const { version: versionParam } = await searchParams;

  // Fetch history first — 404 if prompt doesn't exist
  let history: Awaited<ReturnType<typeof listPromptHistoryByName>>;
  try {
    history = await listPromptHistoryByName(key);
    if (history.length === 0) notFound();
  } catch (err) {
    if (err instanceof PromptNotFoundError) notFound();
    throw err;
  }

  // Determine which version to display
  const activeRow = history.find((p) => p.isActive);
  let viewedVersion = activeRow ?? history[0];

  if (versionParam) {
    const vNum = parseInt(versionParam, 10);
    if (!isNaN(vNum)) {
      try {
        viewedVersion = await getPromptByNameAndVersion(key, vNum);
      } catch {
        // Fall back to active version if the requested version doesn't exist
      }
    }
  }

  const isHistorical = viewedVersion.version !== activeRow?.version;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link
          href="/prompts"
          className="hover:text-gray-800 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Prompts
        </Link>
        <span aria-hidden="true">›</span>
        <span className="font-mono text-gray-800 dark:text-gray-200">{key}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold font-mono">{key}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {PROMPT_DESCRIPTIONS[key] ?? activeRow?.notes ?? "LLM prompt template."}
          </p>
        </div>

        {/* Active version badge */}
        {activeRow && (
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
            Active: v{activeRow.version}
          </span>
        )}
      </div>

      {/* Historical version banner */}
      {isHistorical && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between gap-4 flex-wrap">
          <span>
            Viewing <strong>v{viewedVersion.version}</strong> (not active).{" "}
            {activeRow && (
              <>
                Active version is{" "}
                <Link
                  href={`/prompts/${key}`}
                  className="underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  v{activeRow.version}
                </Link>
                .
              </>
            )}
          </span>
        </div>
      )}

      {/* Main layout: editor + history sidebar */}
      <div className="flex gap-6 items-start">
        {/* Editor — takes remaining width */}
        <div className="flex-1 min-w-0">
          <PromptEditor
            promptKey={key}
            initialContent={viewedVersion.content}
            initialVersion={viewedVersion.version}
            isActive={viewedVersion.isActive}
            isHistorical={isHistorical}
          />
        </div>

        {/* Version history sidebar */}
        <aside className="w-52 shrink-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Version history
          </h2>
          <ul className="space-y-1" role="list">
            {history.map((h) => {
              const isCurrent = h.version === viewedVersion.version;
              return (
                <li key={h.id}>
                  <Link
                    href={
                      h.isActive
                        ? `/prompts/${key}`
                        : `/prompts/${key}?version=${h.version}`
                    }
                    aria-current={isCurrent ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isCurrent
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span>v{h.version}</span>
                    <span className="flex items-center gap-1.5">
                      {h.isActive && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" aria-label="active" />
                      )}
                      <span className="text-gray-400 dark:text-gray-500">
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                        }).format(new Date(h.createdAt))}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
