/**
 * Public exports for the draft generation module — WI-09
 */

export {
  generateDraft,
  generateDraftsForScored,
  sanitizeBody,
  ArticleNotFoundError,
  ArticleNotEligibleError,
} from "./generator";

export type {
  GenerateDraftResult,
  GenerateDraftsForScoredResult,
} from "./generator";
