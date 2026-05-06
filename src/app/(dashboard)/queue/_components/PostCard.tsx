"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PostRow } from "@/lib/posts/queries";
import EditDraftForm from "./EditDraftForm";

// LinkedIn counts Unicode code points, not UTF-16 code units.
function charCount(text: string): number {
  return [...text].length;
}

const LINKEDIN_LIMIT = 3000;

function ScoreBadge({ score, reason }: { score: number | null; reason: string | null }) {
  const [open, setOpen] = useState(false);
  if (score === null) return null;
  const pct = Math.round(score);
  const color =
    pct >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : pct >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${color}`}
        aria-label={`Relevance score: ${pct}.${reason ? " Click for reason." : ""}`}
        aria-expanded={open}>
        {pct}
      </button>
      {open && reason && (
        <div role="tooltip"
          className="absolute z-20 left-0 mt-1 w-64 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-xs text-gray-700 dark:text-gray-300 shadow-lg">
          {reason}
          <button type="button" onClick={() => setOpen(false)}
            className="absolute top-1 right-2 text-gray-400 hover:text-gray-600 text-xs"
            aria-label="Close reason">x</button>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmClassName, children, onConfirm, onCancel, loading }: {
  title: string; message: string; confirmLabel: string; confirmClassName: string;
  children?: React.ReactNode; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h2 id="modal-title" className="text-base font-semibold mb-2">{title}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        {children}
        <div className="flex justify-end gap-3 mt-4">
          <button type="button" onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 text-sm rounded-md font-medium disabled:opacity-50 ${confirmClassName}`}>
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PostCard({ post }: { post: PostRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const body = post.editedText ?? post.draftText ?? "";
  const count = charCount(body);
  const overLimit = count > LINKEDIN_LIMIT;

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Failed to approve");
      } else {
        setShowApprove(false);
        startTransition(() => router.refresh());
      }
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (res.ok || res.status === 204) {
        setShowReject(false);
        startTransition(() => router.refresh());
      } else {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Failed to reject");
      }
    } finally { setActionLoading(false); }
  };

  return (
    <>
      {showApprove && (
        <ConfirmModal title="Approve and Schedule"
          message="This will schedule the post for LinkedIn. Are you sure?"
          confirmLabel="Approve" confirmClassName="bg-blue-600 text-white hover:bg-blue-700"
          onConfirm={handleApprove} onCancel={() => setShowApprove(false)} loading={actionLoading} />
      )}
      {showReject && (
        <ConfirmModal title="Reject Post"
          message="This will cancel the draft. You can optionally add a reason."
          confirmLabel="Reject" confirmClassName="bg-red-600 text-white hover:bg-red-700"
          onConfirm={handleReject}
          onCancel={() => { setShowReject(false); setRejectReason(""); }}
          loading={actionLoading}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Reason (optional)
          </label>
          <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Off-topic, not relevant"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </ConfirmModal>
      )}

      <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-0.5">
              {post.feedSourceName}
            </p>
            <a href={post.articleUrl} target="_blank" rel="noopener noreferrer"
               className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline line-clamp-2">
              {post.articleTitle}
            </a>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <ScoreBadge score={post.articleScore} reason={post.articleScoreReason} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              post.state === "scheduled"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}>{post.state}</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          {post.scheduledFor ? `Scheduled: ${new Date(post.scheduledFor).toLocaleString()}` : "Not scheduled"}
          {post.timingRationale && <span className="ml-2 italic">{post.timingRationale}</span>}
        </p>

        {editing ? (
          <EditDraftForm postId={post.id} initialBody={body}
            onSaved={() => { setEditing(false); startTransition(() => router.refresh()); }}
            onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="rounded-md bg-gray-50 dark:bg-gray-800 p-3">
              <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200 font-sans">
                {body || <span className="italic text-gray-400">No draft text</span>}
              </pre>
            </div>
            <p className={`text-xs font-mono text-right ${
              overLimit ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"
            }`} aria-live="polite">
              {count.toLocaleString()} / {LINKEDIN_LIMIT.toLocaleString()}
              {overLimit && " -- over limit!"}
            </p>
          </>
        )}

        {!editing && (
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={() => setEditing(true)} disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Edit
            </button>
            <button type="button" onClick={() => setShowApprove(true)} disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
              Approve &amp; Schedule
            </button>
            <button type="button" onClick={() => setShowReject(true)} disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 dark:border-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50">
              Reject
            </button>
          </div>
        )}
      </article>
    </>
  );
}