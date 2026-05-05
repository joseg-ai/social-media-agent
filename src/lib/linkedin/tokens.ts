/**
 * LinkedIn token access helper — server-only (Node.js runtime).
 *
 * Primary entry point for any code that needs to call the LinkedIn API
 * (e.g., WI-12 posting service). Returns a valid plaintext access token,
 * transparently refreshing if the token is expiring within 5 minutes.
 *
 * NEVER call this from Edge runtime — it uses node:crypto via decryptToken.
 */
import { eq } from "drizzle-orm";
import { db, oauthTokens } from "@/db";
import { decryptToken, encryptToken, parseEncryptedToken } from "@/lib/crypto";
import { refreshAccessToken, type TokenResponse } from "@/lib/linkedin/oauth";

const PROVIDER = "linkedin";
/** Refresh proactively when fewer than 5 minutes remain. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ── Internal ──────────────────────────────────────────────────────────────────

async function assertTableExists(): Promise<void> {
  try {
    await db.select({ id: oauthTokens.id }).from(oauthTokens).limit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("oauth_tokens") || msg.includes("does not exist")) {
      throw new Error(
        'oauth_tokens table not found. Run "npm run db:migrate" first. ' +
          "This depends on PR #6 (WI-02 schema) being merged and migrations applied.",
      );
    }
    throw err;
  }
}

/**
 * Encrypts and UPSERTs a TokenResponse into the oauth_tokens table.
 * Called from the OAuth callback and from the refresh path.
 * Returns the encrypted token strings so the caller can decrypt without a second DB round-trip.
 */
export async function storeTokenResponse(tokenResponse: TokenResponse): Promise<{
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
}> {
  const encryptedAccess = encryptToken(tokenResponse.access_token);
  const { iv, authTag } = parseEncryptedToken(encryptedAccess);

  const encryptedRefresh = tokenResponse.refresh_token
    ? encryptToken(tokenResponse.refresh_token)
    : null;

  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

  const updateValues = {
    encryptedAccessToken: encryptedAccess,
    encryptedRefreshToken: encryptedRefresh,
    iv,
    authTag,
    scope: tokenResponse.scope,
    expiresAt,
    updatedAt: new Date(),
  };

  await db
    .insert(oauthTokens)
    .values({ ...updateValues, provider: PROVIDER, keyVersion: 1 })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: updateValues,
    });

  return {
    encryptedAccessToken: encryptedAccess,
    encryptedRefreshToken: encryptedRefresh,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a valid plaintext LinkedIn access token.
 * Transparently refreshes when the token expires within 5 minutes.
 * Throws if LinkedIn is not connected or the refresh fails.
 */
export async function getValidAccessToken(): Promise<string> {
  await assertTableExists();

  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, PROVIDER))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      "LinkedIn is not connected. Visit /api/linkedin/auth to start the OAuth flow.",
    );
  }

  const row = rows[0];
  const nowMs = Date.now();
  const expiresAtMs = row.expiresAt ? row.expiresAt.getTime() : 0;
  const isExpiringSoon = expiresAtMs > 0 && expiresAtMs - nowMs < REFRESH_BUFFER_MS;

  if (isExpiringSoon && row.encryptedRefreshToken) {
    const refreshToken = decryptToken(row.encryptedRefreshToken);
    let refreshed: TokenResponse;
    try {
      refreshed = await refreshAccessToken(refreshToken);
    } catch {
      // Refresh failed — fall through and return the current token if not yet expired.
      if (expiresAtMs > nowMs) {
        return decryptToken(row.encryptedAccessToken);
      }
      throw new Error(
        "LinkedIn access token is expired and refresh failed. Reconnect via /api/linkedin/auth.",
      );
    }
    const stored = await storeTokenResponse(refreshed);
    return decryptToken(stored.encryptedAccessToken);
  }

  return decryptToken(row.encryptedAccessToken);
}

/**
 * Returns true if a LinkedIn token row exists in the DB.
 * Safe to call even if the table does not exist yet (returns false gracefully).
 */
export async function isLinkedInConnected(): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: oauthTokens.id })
      .from(oauthTokens)
      .where(eq(oauthTokens.provider, PROVIDER))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
