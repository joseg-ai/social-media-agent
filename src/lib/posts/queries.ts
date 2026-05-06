import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, feedSources, posts } from "@/db/schema";
import type { postStateEnum } from "@/db/schema";

export type PostState = (typeof postStateEnum.enumValues)[number];

export type PostRow = {
  id: string;
  state: PostState;
  body: string | null;
  draftText: string | null;
  editedText: string | null;
  timingRationale: string | null;
  scheduledFor: Date | null;
  postedAt: Date | null;
  linkedinPostId: string | null;
  failureReason: string | null;
  isDryRun: boolean;
  autoPost: boolean;
  createdAt: Date;
  updatedAt: Date;
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  articleScore: number | null;
  articleScoreReason: string | null;
  feedSourceId: string;
  feedSourceName: string;
};

function mapRow(row: {
  posts: typeof posts.$inferSelect;
  articles: typeof articles.$inferSelect;
  feed_sources: typeof feedSources.$inferSelect;
}): PostRow {
  const { posts: p, articles: a, feed_sources: fs } = row;
  return {
    id: p.id,
    state: p.state,
    body: p.editedText ?? p.draftText,
    draftText: p.draftText,
    editedText: p.editedText,
    timingRationale: p.timingRationale,
    scheduledFor: p.scheduledFor,
    postedAt: p.postedAt,
    linkedinPostId: p.linkedinPostId,
    failureReason: p.failureReason,
    isDryRun: p.isDryRun,
    autoPost: p.autoPost,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    articleId: a.id,
    articleTitle: a.title,
    articleUrl: a.url,
    articleScore: a.relevanceScore,
    articleScoreReason: a.scoringReasoning,
    feedSourceId: fs.id,
    feedSourceName: fs.name,
  };
}

export interface ListPostsOptions {
  states: PostState[];
  limit?: number;
  offset?: number;
  orderBy?: "queue" | "history";
}

export async function listPosts({
  states,
  limit = 50,
  offset = 0,
  orderBy = "queue",
}: ListPostsOptions): Promise<PostRow[]> {
  const rows = await db
    .select()
    .from(posts)
    .innerJoin(articles, eq(posts.articleId, articles.id))
    .innerJoin(feedSources, eq(articles.feedSourceId, feedSources.id))
    .where(inArray(posts.state, states))
    .orderBy(
      ...(orderBy === "queue"
        ? [sql`${posts.scheduledFor} ASC NULLS LAST`, desc(posts.createdAt)]
        : [sql`${posts.postedAt} DESC NULLS LAST`, desc(posts.createdAt)]),
    )
    .limit(limit)
    .offset(offset);
  return rows.map(mapRow);
}

export async function getPost(id: string): Promise<PostRow | null> {
  const rows = await db
    .select()
    .from(posts)
    .innerJoin(articles, eq(posts.articleId, articles.id))
    .innerJoin(feedSources, eq(articles.feedSourceId, feedSources.id))
    .where(eq(posts.id, id))
    .limit(1);
  return rows.length > 0 ? mapRow(rows[0]!) : null;
}
