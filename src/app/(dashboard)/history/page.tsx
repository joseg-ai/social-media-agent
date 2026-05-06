import type { SearchParams } from "next/dist/server/request/search-params";
import { listPosts } from "@/lib/posts/queries";
import HistoryPostRow from "./_components/PostRow";

export const metadata = { title: "History -- Social Media Agent" };

// Force dynamic rendering -- page queries the DB and reads searchParams.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const posts = await listPosts({
    states: ["posted", "failed", "cancelled"],
    orderBy: "history",
    limit: PAGE_SIZE + 1,
    offset,
  });

  const hasNext = posts.length > PAGE_SIZE;
  const rows = hasNext ? posts.slice(0, PAGE_SIZE) : posts;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Posts that have been published, failed, or cancelled.
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No history yet. Posts appear here once published, failed, or cancelled.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Time</th>
                <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Article</th>
                <th scope="col" className="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Score</th>
                <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">State</th>
                <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Post</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((post) => (
                <HistoryPostRow key={post.id} post={post} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNext) && (
        <nav className="mt-6 flex items-center justify-between" aria-label="History pagination">
          {page > 1 ? (
            <a href={`/history?page=${page - 1}`} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">
              Previous
            </a>
          ) : <span />}
          <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
          {hasNext ? (
            <a href={`/history?page=${page + 1}`} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">
              Next
            </a>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}