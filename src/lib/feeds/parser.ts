/**
 * RSS/Atom feed parser — wraps rss-parser with normalized output.
 *
 * Returns a flat array of ParsedArticle objects regardless of whether the
 * upstream feed is RSS 2.0 or Atom. Articles without a resolvable URL are
 * silently filtered out.
 */
import { createHash } from "crypto";
import Parser from "rss-parser";

export interface ParsedArticle {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date | null;
  author: string | null;
  /** SHA-256 hex of (title + summary) — matches the articles.content_hash column. */
  contentHash: string;
  /** Raw feed item preserved for rawMetadata column. */
  rawMetadata: Record<string, unknown>;
}

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "social-media-agent/1.0 (RSS ingestion bot)" },
});

/** Derive a stable content hash from title + summary text. */
function hashContent(title: string, summary: string | null): string {
  return createHash("sha256")
    .update(title + (summary ?? ""))
    .digest("hex");
}

/**
 * Fetch and parse a feed URL, returning normalized articles.
 *
 * Throws on network failure or malformed XML so callers can decide how to
 * handle errors (ingestFeed catches; direct callers see the raw Error).
 */
export async function parseFeed(url: string): Promise<ParsedArticle[]> {
  const feed = await parser.parseURL(url);

  return feed.items
    .map((item): ParsedArticle | null => {
      const url = item.link ?? item.guid ?? "";
      if (!url) return null;

      const title = item.title ?? "(untitled)";
      const summary =
        item.contentSnippet ?? item.summary ?? item.content ?? null;

      return {
        title,
        url,
        summary: summary ? summary.trim() : null,
        publishedAt: item.pubDate
          ? new Date(item.pubDate)
          : item.isoDate
            ? new Date(item.isoDate)
            : null,
        author: (item as Record<string, unknown>)["dc:creator"]
          ? String((item as Record<string, unknown>)["dc:creator"])
          : item.creator ?? null,
        contentHash: hashContent(title, summary ?? null),
        rawMetadata: item as Record<string, unknown>,
      };
    })
    .filter((a): a is ParsedArticle => a !== null);
}
