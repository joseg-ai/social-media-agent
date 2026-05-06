/**
 * LinkedIn module — WI-12
 *
 * Re-exports the OAuth flow (WI-19), token access helpers, and the
 * UGC Posts API poster added in WI-12.
 */

export {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  LinkedInOAuthError,
  type TokenResponse,
} from "./oauth";

export {
  storeTokenResponse,
  getValidAccessToken,
  isLinkedInConnected,
} from "./tokens";

export {
  postToLinkedIn,
  LinkedInAuthError,
  LinkedInPostError,
  LinkedInTransientError,
} from "./poster";
