/**
 * GET /api/linkedin/callback
 *
 * Handles the LinkedIn OAuth 2.0 callback after the user approves access.
 *
 * Steps:
 *   1. Validate `state` against the HttpOnly cookie (constant-time comparison).
 *   2. Exchange the authorization code for tokens via LinkedIn's token endpoint.
 *   3. Encrypt access_token + refresh_token with AES-256-GCM (WI-19 spike).
 *   4. UPSERT into `oauth_tokens` table (one row per provider — LinkedIn only).
 *   5. Clear the state cookie and redirect to `/?linkedin=connected`.
 *
 * Security notes:
 *   - timingSafeEqual prevents timing-based state oracle attacks.
 *   - Tokens are NEVER logged — only metadata (expires_in, scope, has_refresh).
 *   - State cookie is cleared on both success and error paths.
 *
 * Depends on: PR #6 (WI-02) for the oauth_tokens table. If the table does not
 * exist, storeTokenResponse will throw a clear error directing the operator to
 * run `npm run db:migrate`.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, LinkedInOAuthError } from "@/lib/linkedin/oauth";
import { storeTokenResponse } from "@/lib/linkedin/tokens";

const STATE_COOKIE = "linkedin_oauth_state";

/** Constant-time string comparison — prevents timing-based state oracle attacks. */
function safeCompareState(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // LinkedIn returns an error query param if the user denied access.
  if (errorParam) {
    console.warn("[linkedin/callback] OAuth denied or errored:", errorParam);
    const res = NextResponse.redirect(new URL("/?linkedin=denied", request.url));
    clearStateCookie(res);
    return res;
  }

  if (!code || !stateParam) {
    console.warn("[linkedin/callback] Missing code or state parameter.");
    const res = NextResponse.redirect(new URL("/?linkedin=error", request.url));
    clearStateCookie(res);
    return res;
  }

  // ── CSRF state validation ────────────────────────────────────────────────────
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!storedState || !safeCompareState(stateParam, storedState)) {
    console.warn("[linkedin/callback] State mismatch — possible CSRF attempt.");
    const res = NextResponse.redirect(new URL("/?linkedin=error", request.url));
    clearStateCookie(res);
    return res;
  }

  // ── Token exchange ───────────────────────────────────────────────────────────
  let tokenResponse: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    tokenResponse = await exchangeCodeForToken(code);
  } catch (err) {
    const status = err instanceof LinkedInOAuthError ? err.status : undefined;
    console.error("[linkedin/callback] Token exchange failed. Status:", status ?? "unknown");
    const res = NextResponse.redirect(new URL("/?linkedin=error", request.url));
    clearStateCookie(res);
    return res;
  }

  // Log metadata only — never log token values.
  console.info("[linkedin/callback] Token received.", {
    expires_in: tokenResponse.expires_in,
    scope: tokenResponse.scope,
    has_refresh_token: Boolean(tokenResponse.refresh_token),
    has_id_token: Boolean(tokenResponse.id_token),
  });

  // ── Encrypt and persist ──────────────────────────────────────────────────────
  try {
    await storeTokenResponse(tokenResponse);
  } catch (err) {
    console.error("[linkedin/callback] Failed to store tokens:", (err as Error).message);
    const res = NextResponse.redirect(new URL("/?linkedin=error", request.url));
    clearStateCookie(res);
    return res;
  }

  console.info("[linkedin/callback] LinkedIn connected successfully.");

  const res = NextResponse.redirect(new URL("/?linkedin=connected", request.url));
  clearStateCookie(res);
  return res;
}
