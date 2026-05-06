/**
 * Posts module — WI-11
 *
 * State machine, scheduling integration, and publisher claim.
 */

export {
  transitionPost,
  approveDraft,
  cancelPost,
  claimForPosting,
  markPosted,
  markFailed,
  retryFailed,
  InvalidStateTransitionError,
  PostNotFoundError,
  NotImplementedError,
  type Post,
  type PostState,
  type TransitionOpts,
} from "./state-machine";

export {
  scheduleDraft,
  scheduleAllDrafts,
  type ScheduleDraftResult,
  type ScheduleAllDraftsResult,
} from "./scheduler";

export {
  claimReadyPosts,
  publishPost,
  type ClaimReadyPostsOpts,
} from "./publisher";
