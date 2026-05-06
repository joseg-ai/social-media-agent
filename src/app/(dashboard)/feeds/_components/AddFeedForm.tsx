"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Show a more prominent CTA (used in the empty state). */
  prominent?: boolean;
}

export function AddFeedForm({ prominent = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const url = (form.get("url") as string).trim();
    const rawName = (form.get("name") as string).trim();

    setLoading(true);
    try {
      // Default name to URL hostname when the user leaves the field empty
      const name = rawName || new URL(url).hostname;

      const res = await fetch("/api/feeds", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });

      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }

      const data = (await res.json()) as { error?: string; message?: string };
      if (res.status === 409) {
        setError("A feed with this URL already exists.");
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const triggerClass = prominent
    ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
    : "rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        + Add feed
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4"
      aria-label="Add RSS feed"
    >
      <h2 className="text-sm font-semibold">Add RSS feed</h2>

      <div className="space-y-1.5">
        <label htmlFor="feed-url" className="text-sm font-medium">
          Feed URL <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id="feed-url"
          name="url"
          type="url"
          required
          placeholder="https://devblogs.microsoft.com/feed/"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="feed-name" className="text-sm font-medium">
          Name{" "}
          <span className="text-gray-400 font-normal">(optional — defaults to hostname)</span>
        </label>
        <input
          id="feed-name"
          name="name"
          type="text"
          maxLength={255}
          placeholder="Microsoft Dev Blogs"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Adding…" : "Add feed"}
        </button>
      </div>
    </form>
  );
}
