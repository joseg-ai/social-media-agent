"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedSource } from "@/lib/feeds/sources";

interface Props {
  feed: FeedSource;
}

export function FeedRow({ feed }: Props) {
  const router = useRouter();
  const [togglePending, setTogglePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleToggle() {
    setTogglePending(true);
    try {
      await fetch(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !feed.enabled }),
      });
      router.refresh();
    } finally {
      setTogglePending(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    if (!confirm(`Delete "${feed.name}"? This cannot be undone.`)) return;

    setDeletePending(true);
    try {
      const res = await fetch(`/api/feeds/${feed.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 204) {
        router.refresh();
        return;
      }

      if (res.status === 409) {
        const data = (await res.json()) as { postCount?: number };
        const n = data.postCount ?? "some";
        setDeleteError(
          `Can't delete — this feed has ${n} post${n === 1 ? "" : "s"} attached. Cancel or archive those posts first.`,
        );
        return;
      }

      setDeleteError("Delete failed. Please try again.");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeletePending(false);
    }
  }

  const lastPolled = feed.lastPolledAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(feed.lastPolledAt))
    : "Never";

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
        {/* Name */}
        <td className="px-4 py-3 font-medium max-w-[200px] truncate">
          <span title={feed.name}>{feed.name}</span>
        </td>

        {/* URL */}
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[280px]">
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate block hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            title={feed.url}
          >
            {feed.url}
          </a>
        </td>

        {/* Status badge */}
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              feed.enabled
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {feed.enabled ? "Active" : "Paused"}
          </span>
        </td>

        {/* Last polled */}
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {lastPolled}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleToggle}
              disabled={togglePending}
              aria-label={feed.enabled ? `Pause ${feed.name}` : `Activate ${feed.name}`}
              className="rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {togglePending ? "…" : feed.enabled ? "Pause" : "Activate"}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              aria-label={`Delete ${feed.name}`}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-transparent hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deletePending ? "…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>

      {/* Inline error row for 409 delete conflict */}
      {deleteError && (
        <tr>
          <td
            colSpan={5}
            className="px-4 py-2 bg-red-50 dark:bg-red-900/10"
          >
            <p role="alert" className="text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
              <span aria-hidden="true">⚠️</span>
              <span>
                {deleteError}{" "}
                <button
                  type="button"
                  onClick={() => setDeleteError(null)}
                  className="underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Dismiss
                </button>
              </span>
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
