"use client";

import { useState } from "react";

const LINKEDIN_LIMIT = 3000;

function charCount(text: string): number {
  return [...text].length;
}

export default function EditDraftForm({
  postId,
  initialBody,
  onSaved,
  onCancel,
}: {
  postId: string;
  initialBody: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const count = charCount(text);
  const overLimit = count > LINKEDIN_LIMIT;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-sans"
        aria-label="Edit post body"
      />
      <p
        className={`text-xs font-mono text-right ${
          overLimit ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"
        }`}
        aria-live="polite"
      >
        {count.toLocaleString()} / {LINKEDIN_LIMIT.toLocaleString()}
        {overLimit && " -- over limit!"}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || overLimit}
          className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}