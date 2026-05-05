/**
 * src/lib/timing — public exports (WI-08)
 */

export {
  getPostingContext,
  applyPreflightChecks,
  decidePostingAction,
} from "./advisor";

export type {
  PostingWindow,
  TimingContext,
  TimingAction,
  TimingDecision,
} from "./advisor";
