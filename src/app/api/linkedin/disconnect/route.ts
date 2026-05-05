/**
 * POST /api/linkedin/disconnect
 *
 * Removes the stored LinkedIn OAuth tokens, effectively disconnecting the app.
 * Does NOT revoke the token on LinkedIn's side — the user must do that
 * manually via LinkedIn's security settings if desired.
 *
 * Auth gate: assumes the caller is authenticated (WI-13 middleware covers this).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, oauthTokens } from "@/db";
import { env } from "@/lib/env";

const PROVIDER = "linkedin";

export async function POST(): Promise<NextResponse> {
  try {
    await db.delete(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
    console.info("[linkedin/disconnect] Token row deleted for provider:", PROVIDER);
  } catch (err) {
    console.error("[linkedin/disconnect] Failed to delete token row:", (err as Error).message);
    return NextResponse.redirect(new URL("/?linkedin=error", env.APP_BASE_URL));
  }

  return NextResponse.redirect(new URL("/?linkedin=disconnected", env.APP_BASE_URL));
}
