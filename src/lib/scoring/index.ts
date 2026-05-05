/**
 * src/lib/scoring - Article relevance scoring module (WI-07)
 *
 * Public API surface (import from "@/lib/scoring"):
 *
 *   scoreArticle(articleId)          -> Promise<ScoreResult>
 *   scoreUnscoredArticles(opts?)     -> Promise<BatchResult>
 *
 * Types:
 *   ScoreResult, BatchResult
 */

export { scoreArticle, scoreUnscoredArticles } from "./relevance";
export type { ScoreResult, BatchResult } from "./relevance";