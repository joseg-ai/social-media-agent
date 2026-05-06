import { listPosts } from "@/lib/posts/queries";
import PostCard from "./_components/PostCard";

export const metadata = { title: "Queue -- Social Media Agent" };

// Force dynamic rendering -- page queries the DB directly.
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const posts = await listPosts({
    states: ["draft", "scheduled"],
    orderBy: "queue",
    limit: 100,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Queue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Drafts and scheduled posts awaiting your review.
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {posts.length} post{posts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No drafts or scheduled posts. The agent will populate this queue
            when it finds relevant articles.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4" role="list">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}