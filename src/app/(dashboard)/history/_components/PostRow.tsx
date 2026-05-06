import type { PostRow } from "@/lib/posts/queries";

const LINKEDIN_POST_BASE = "https://www.linkedin.com/feed/update/";

const STATE_STYLES: Record<string, string> = {
  posted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function formatDate(d: Date | null | undefined): string {
  if (!d) return "--";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const EXCERPT_LIMIT = 200;

function excerpt(text: string | null): string {
  if (!text) return "";
  const plain = text.replace(/\n+/g, " ");
  return plain.length > EXCERPT_LIMIT ? plain.slice(0, EXCERPT_LIMIT) + "..." : plain;
}

export default function HistoryPostRow({ post }: { post: PostRow }) {
  const timestamp = post.postedAt ?? post.createdAt;
  const stateClass = STATE_STYLES[post.state] ?? STATE_STYLES.cancelled!;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {formatDate(timestamp)}
      </td>
      <td className="py-3 px-4 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide font-medium truncate">
          {post.feedSourceName}
        </p>
        <a href={post.articleUrl} target="_blank" rel="noopener noreferrer"
           className="text-sm text-blue-600 dark:text-blue-400 hover:underline line-clamp-1">
          {post.articleTitle}
        </a>
      </td>
      <td className="py-3 px-4 text-center">
        {post.articleScore !== null ? (
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                title={post.articleScoreReason ?? undefined}>
            {Math.round(post.articleScore)}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 text-xs">--</span>
        )}
      </td>
      <td className="py-3 px-4">
        {post.state === "posted" && post.linkedinPostId ? (
          <a href={`${LINKEDIN_POST_BASE}${post.linkedinPostId}`} target="_blank" rel="noopener noreferrer"
             className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stateClass} hover:opacity-80`}>
            posted
          </a>
        ) : (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stateClass}`}>
            {post.state}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 max-w-md">
        <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">
          {excerpt(post.body)}
        </p>
        {post.state === "failed" && post.failureReason && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">Error: {post.failureReason}</p>
        )}
        {post.state === "cancelled" && post.failureReason && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Reason: {post.failureReason}</p>
        )}
      </td>
    </tr>
  );
}