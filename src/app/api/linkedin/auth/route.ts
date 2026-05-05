/**
 * GET /api/linkedin/auth
 *
 * Initiates the LinkedIn OAuth 2.0 authorization code flow.
 * - Generates a cryptographically random state token (CSRF protection).
 * - Stores it in an HttpOnly, SameSite=Lax cookie (SameSite=Strict would
 *   break the redirect back from LinkedIn's domain).
 * - Redirects the user to LinkedIn's authorization endpoint.
 *
 * Auth gate: assumes the caller is authenticated (WI-13 middleware covers this).
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/linkedin/oauth";

const STATE_COOKIE = "linkedin_oauth_state";
/** State cookie lives 10 minutes — enough for any OAuth round-trip. */
const STATE_MAX_AGE_SECONDS = 10 * 60;

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(32).toString("hex");
  const authUrl = getAuthorizationUrl(state);

  const response = NextResponse.redirect(authUrl);

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // lax required: LinkedIn redirects cross-origin back to us
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
