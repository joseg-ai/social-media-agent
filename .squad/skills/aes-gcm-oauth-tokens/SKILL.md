# SKILL: AES-GCM Token Encryption + Next.js 15 OAuth Callback

**Slug:** `aes-gcm-oauth-tokens`
**Author:** Tank
**First used in:** WI-19 (social-media-agent)
**Applicable to:** Any Next.js 15 App Router app that stores OAuth tokens encrypted at rest.

---

## Problem

OAuth tokens (access + refresh) need to be stored in a database encrypted at rest. Node's crypto module provides AES-256-GCM, but there are several gotchas:
- Never reuse an IV for GCM.
- Each token stored in separate columns needs its own IV.
- The callback route needs constant-time state comparison to prevent CSRF timing attacks.
- SameSite=Strict breaks the OAuth redirect from the provider back to your domain.

---

## Pattern

### 1. Encryption helper (`src/lib/crypto.ts`)

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV — GCM recommended

function getKey(): Buffer {
  return Buffer.from(process.env.YOUR_ENCRYPTION_KEY!, "base64");
}

// Returns "iv_b64:ciphertext_b64:authTag_b64" — self-contained per token.
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), ciphertext.toString("base64"), authTag.toString("base64")].join(":");
}

export function decryptToken(encrypted: string): string {
  const [ivB64, ciphertextB64, authTagB64] = encrypted.split(":");
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}
```

Key generation: `openssl rand -base64 32`

### 2. OAuth start route (`GET /api/[provider]/auth/route.ts`)

```typescript
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

const STATE_COOKIE = "oauth_state";

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(32).toString("hex");
  const authUrl = buildAuthUrl(state); // provider-specific

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",   // MUST be lax — strict breaks provider redirect back
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,   // 10 minutes
    path: "/",
  });
  return response;
}
```

### 3. OAuth callback route (`GET /api/[provider]/callback/route.ts`)

```typescript
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function safeCompareState(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;

  if (!code || !stateParam || !storedState || !safeCompareState(stateParam, storedState)) {
    return redirect("/?error=oauth_failed");
  }

  const tokens = await exchangeCode(code);
  const encrypted = encryptToken(tokens.access_token);
  await upsertTokenRow({ encryptedAccessToken: encrypted, ... });

  const res = NextResponse.redirect("/?connected=true");
  res.cookies.set("oauth_state", "", { maxAge: 0 }); // clear state cookie
  return res;
}
```

### 4. Token retrieval with auto-refresh

```typescript
export async function getValidAccessToken(): Promise<string> {
  const row = await db.select().from(tokens).where(eq(tokens.provider, "x")).limit(1);
  if (!row.length) throw new Error("Not connected");

  const expiresAtMs = row[0].expiresAt?.getTime() ?? 0;
  const soonMs = 5 * 60 * 1000;

  if (expiresAtMs - Date.now() < soonMs && row[0].encryptedRefreshToken) {
    const refreshed = await refreshToken(decryptToken(row[0].encryptedRefreshToken));
    await storeTokens(refreshed);
    return refreshed.access_token;
  }

  return decryptToken(row[0].encryptedAccessToken);
}
```

---

## Checklist

- [ ] 32-byte base64 key in env var (not hardcoded)
- [ ] State cookie: `httpOnly: true, sameSite: "lax"` (not strict!)
- [ ] State comparison: `timingSafeEqual` (not `===`)
- [ ] Tokens NEVER appear in logs — log only `expires_in`, `scope`, `has_refresh_token`
- [ ] Clear state cookie on both success and error paths
- [ ] Refresh token stored with its own IV (independent `encryptToken` call)
- [ ] `SKIP_ENV_VALIDATION=1` for CI builds that inject env vars at runtime

---

## Key env var

```
# Generate with:
openssl rand -base64 32

YOUR_ENCRYPTION_KEY=<44-char base64 string>
```