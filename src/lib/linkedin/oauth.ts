/**
 * LinkedIn OAuth 2.0 helpers — authorization code flow.
 *
 * Scopes requested:
 *   openid          — OpenID Connect (issues id_token, enables userinfo endpoint)
 *   profile         — Display name + profile photo (required alongside openid)
 *   w_member_social — Post on the authenticated member's behalf (required for WI-12)
 *
 * Refresh tokens: LinkedIn issues them for apps using the
 * "Sign In with LinkedIn using OpenID Connect" product. The field is optional
 * in TokenResponse — callers must check for its presence before relying on it.
 */
import { env } from "@/lib/env";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

/** Scopes requested. w_member_social is required for WI-12 (posting). */
const SCOPES = "openid profile w_member_social";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  /** Only present if LinkedIn grants refresh tokens for this app/scope combo. */
  refresh_token?: string;
  /** Lifetime of the refresh token in seconds, if issued. */
  refresh_token_expires_in?: number;
  scope: string;
  token_type: string;
  /** OpenID Connect identity token — present when the `openid` scope is granted. */
  id_token?: string;
}

export class LinkedInOAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LinkedInOAuthError";
  }
}

// ── Authorization URL ─────────────────────────────────────────────────────────

/**
 * Builds the LinkedIn OAuth 2.0 authorization URL.
 * The `state` parameter is a CSRF token the caller generates and stores
 * in an HttpOnly cookie before redirecting the user.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: env.LINKEDIN_REDIRECT_URI,
    scope: SCOPES,
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchanges an authorization code (from the OAuth callback) for an access token.
 * Uses standard fetch — no third-party HTTP clients.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.LINKEDIN_REDIRECT_URI,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Consume body to free the connection; do NOT log it — may contain secrets.
    await res.text().catch(() => "");
    throw new LinkedInOAuthError(
      `LinkedIn token exchange failed with status ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<TokenResponse>;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Exchanges a refresh token for a new access token.
 * LinkedIn only issues refresh tokens for certain app configurations —
 * callers should verify that a refresh_token exists before calling this.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    await res.text().catch(() => "");
    throw new LinkedInOAuthError(
      `LinkedIn token refresh failed with status ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<TokenResponse>;
}
