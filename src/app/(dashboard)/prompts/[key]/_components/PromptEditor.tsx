"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Props {
  promptKey: string;
  initialContent: string;
  initialVersion: number;
  isActive: boolean;
  /** True when viewing an older (non-active) version */
  isHistorical: boolean;
}

export function PromptEditor({
  promptKey,
  initialContent,
  initialVersion,
  isActive,
  isHistorical,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync when the viewed version changes (parent re-renders with new props)
  useEffect(() => {
    setContent(initialContent);
    setIsDirty(false);
    setActionError(null);
    setSuccessMsg(null);
  }, [initialContent, initialVersion]);

  // Warn before navigating away with unsaved changes
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    },
    [isDirty]
  );

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [handleBeforeUnload]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    setIsDirty(e.target.value !== initialContent);
    setActionError(null);
    setSuccessMsg(null);
  }

  async function handleSave() {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    setActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/prompts/${promptKey}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Save failed. Please try again.");
        return;
      }

      setIsDirty(false);
      setSuccessMsg("Saved as new version ✓");
      router.refresh();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate() {
    if (isActivating) return;
    setIsActivating(true);
    setActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/prompts/${promptKey}/activate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: initialVersion }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Activation failed. Please try again.");
        return;
      }

      setSuccessMsg(`v${initialVersion} is now active ✓`);
      router.refresh();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setIsActivating(false);
    }
  }

  const charCount = [...content].length;

  return (
    <div className="flex flex-col gap-3">
      {/* Textarea */}
      <div className="relative">
        <textarea
          value={content}
          onChange={handleChange}
          rows={24}
          spellCheck={false}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm font-mono leading-relaxed resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
          aria-label="Prompt content editor"
        />
        {/* Char count */}
        <span className="absolute bottom-2 right-3 text-xs text-gray-400 dark:text-gray-500 pointer-events-none select-none">
          {charCount.toLocaleString()} chars
        </span>
      </div>

      {/* Error */}
      {actionError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          <span aria-hidden="true">⚠️</span>
          <span>
            {actionError}{" "}
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Dismiss
            </button>
          </span>
        </p>
      )}

      {/* Success */}
      {successMsg && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-400"
        >
          {successMsg}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Save button — shown for active or historical (creates new version) */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? "Saving…" : "Save as new version"}
        </button>

        {/* Activate button — only when viewing an older non-active version */}
        {isHistorical && !isActive && (
          <button
            type="button"
            onClick={handleActivate}
            disabled={isActivating || isDirty}
            className="rounded-md px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isDirty ? "Save changes before activating" : undefined}
          >
            {isActivating ? "Activating…" : `Make v${initialVersion} active`}
          </button>
        )}

        {isDirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}
