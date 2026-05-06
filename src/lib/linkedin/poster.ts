/**
 * LinkedIn UGC Posts API — WI-12
 *
 * Single responsibility: given a plaintext access token and a Post row,
 * publish a text-only LinkedIn post and return the resulting post URN.
 *
 * Error hierarchy:
 *   LinkedInAuthError       — 401 after one refresh-retry
 *   LinkedInPostError       — 422 content rejected or 429 rate-limited
 *   LinkedInTransientError  — 5xx: retry is safe
 */

import { eq } from "drizzle-orm";
import { db, oauthTokens } from "@/db";
import type { Post } from "@/lib/posts/state-machine";

// ── Error classes ─────────────────────────────────────────────────────────────

export class LinkedInAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInAuthError";
  }
}

export class LinkedInPostError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "LinkedInPostError";
  }
}

export class LinkedInTransientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LinkedInTransientError";
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const PROVIDER = "linkedin";

// ── Person URN helpers ────────────────────────────────────────────────────────

/**
 * Returns the LinkedIn person URN for the stored token row.
 * Cache-first: reads DB, calls /v2/userinfo on miss, writes back.
 */
async function getPersonUrn(accessToken: string): Promise<string> {
  const rows = await db
    .select({ id: oauthTokens.id, linkedinPersonUrn: oauthTokens.linkedinPersonUrn })
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, PROVIDER))
    .limit(1);

  if (rows.length === 0) {
    throw new LinkedInAuthError(
      "LinkedIn is not connected — no oauth_tokens row found.",
    );
  }

  const row = rows[0]!;

  if (row.linkedinPersonUrn) {
    return row.linkedinPersonUrn;
  }

  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new LinkedInAuthError(
      "LinkedIn userinfo returned 401 — token may be revoked.",
    );
  }

  if (!res.ok) {
    throw new LinkedInTransientError(
      `LinkedIn userinfo failed with status ${res.status}`,
      res.status,
    );
  }

  const info = (await res.json()) as { sub?: string };
  if (!info.sub) {
    throw new LinkedInAuthError(
      "LinkedIn userinfo response missing `sub` field.",
    );
  }

  const personUrn = info.sub.startsWith("urn:li:")
    ? info.sub
    : `urn:li:person:${info.sub}`;

  await db
    .update(oauthTokens)
    .set({ linkedinPersonUrn: personUrn, updatedAt: new Date() })
    .where(eq(oauthTokens.id, row.id));

  return personUrn;
}

// ── UGC post call ─────────────────────────────────────────────────────────────

async function callUgcPostsApi(
  personUrn: string,
  body: string,
  accessToken: string,
): Promise<{ linkedinPostId: string }> {
  const payload = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: body },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch(UGC_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const data = (await res.json()) as { id?: string };
    const linkedinPostId = data.id;
    if (!linkedinPostId) {
      throw new LinkedInTransientError(
        "LinkedIn API returned 2xx but response body has no `id` field.",
        res.status,
      );
    }
    return { linkedinPostId };
  }

  if (res.status === 401) {
    throw new LinkedInAuthError(
      `LinkedIn UGC Posts API returned 401 — token may be expired or revoked.`,
    );
  }

  if (res.status === 422 || res.status === 429) {
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = await res.text().catch(() => "<unreadable>");
    }
    throw new LinkedInPostError(
      `LinkedIn UGC Posts API returned ${res.status}`,
      res.status,
      errorBody,
    );
  }

  if (res.status >= 500) {
    throw new LinkedInTransientError(
      `LinkedIn UGC Posts API returned ${res.status} — transient server error.`,
      res.status,
    );
  }

  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    errorBody = await res.text().catch(() => "<unreadable>");
  }
  throw new LinkedInPostError(
    `LinkedIn UGC Posts API returned unexpected status ${res.status}`,
    res.status,
    errorBody,
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes a text-only LinkedIn post via the UGC Posts API.
 *
 * On 401, transparently refreshes the access token via getValidAccessToken()
 * and retries exactly once. A second 401 throws LinkedInAuthError.
 *
 * Returns the full LinkedIn post URN (e.g. "urn:li:share:7000000000000000000").
 * Used directly in https://www.linkedin.com/feed/update/{urn}.
 */
export async function postToLinkedIn(
  post: Post,
  accessToken: string,
): Promise<{ linkedinPostId: string }> {
  const personUrn = await getPersonUrn(accessToken);
  const body = post.editedText ?? post.draftText ?? "";

  try {
    return await callUgcPostsApi(personUrn, body, accessToken);
  } catch (err) {
    if (!(err instanceof LinkedInAuthError)) {
      throw err;
    }

    // 401 on first attempt — try to get a fresh token and retry once.
    const { getValidAccessToken } = await import("@/lib/linkedin/tokens");
    let freshToken: string;
    try {
      freshToken = await getValidAccessToken();
    } catch {
      throw new LinkedInAuthError(
        "LinkedIn token refresh failed after 401 from UGC Posts API.",
      );
    }

    try {
      return await callUgcPostsApi(personUrn, body, freshToken);
    } catch (retryErr) {
      if (retryErr instanceof LinkedInAuthError) {
        throw new LinkedInAuthError(
          "LinkedIn UGC Posts API returned 401 after token refresh — token revoked or scope missing.",
        );
      }
      throw retryErr;
    }
  }
}
