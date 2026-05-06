import { listFeedSources } from "@/lib/feeds/sources";
import { AddFeedForm } from "./_components/AddFeedForm";
import { FeedRow } from "./_components/FeedRow";
import type { Metadata } from "next";

// Always server-render — data is live from the DB and page is behind auth.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feeds — Social Media Agent",
};

export default async function FeedsPage() {
  const feeds = await listFeedSources({ includeInactive: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">RSS Feeds</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Manage the RSS sources the agent polls for content.
          </p>
        </div>
        <AddFeedForm />
      </div>

      {feeds.length === 0 ? (
        <EmptyState />
      ) : (
        <FeedsTable feeds={feeds} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        No feeds yet. Add your first RSS feed to get started.
      </p>
      <div className="mt-4">
        <AddFeedForm prominent />
      </div>
    </div>
  );
}

function FeedsTable({ feeds }: { feeds: Awaited<ReturnType<typeof listFeedSources>> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Name</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">URL</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Last polled</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
