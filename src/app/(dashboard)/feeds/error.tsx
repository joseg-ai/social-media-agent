"use client";

import { useEffect } from "react";

export default function FeedsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[feeds] page error", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 p-8 text-center space-y-4">
      <p className="text-sm font-medium text-red-700 dark:text-red-400">
        Failed to load feeds.
      </p>
      <p className="text-xs text-red-600 dark:text-red-500">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
