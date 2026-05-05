/**
 * Edge-compatible HMAC-SHA256 session utilities.
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) so the same module runs
 * in both Next.js Edge middleware and Node.js API routes — no node:crypto here.
 *
 * Token shape: "{unixTs}.{hmacHex}"
 *   - ts  = seconds since epoch at token creation
 *   - hmac = HMAC-SHA256( key=SESSION_SECRET|DASHBOARD_PASSWORD, msg="auth:{ts}" )
 *
 * crypto.subtle.verify() is constant-time, which handles timing-safe comparison
 * without needing node:crypto.timingSafeEqual in this shared module.
 */

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Creates a signed session token: "{ts}.{hmacHex}" */
export async function createSessionToken(secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const key = await importHmacKey(secret);
  const enc = new TextEncoder();
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`auth:${ts}`));
  return `${ts}.${bytesToHex(sig)}`;
}

/**
 * Verifies a session token.
 * Returns true only when HMAC is valid AND the token is within SESSION_MAX_AGE_SECONDS.
 * crypto.subtle.verify is constant-time — safe against timing attacks.
 */
export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    const dot = token.indexOf(".");
    if (dot === -1) return false;

    const tsStr = token.slice(0, dot);
    const hmacHex = token.slice(dot + 1);

    const ts = parseInt(tsStr, 10);
    if (!Number.isFinite(ts)) return false;

    const now = Math.floor(Date.now() / 1000);
    // Reject expired tokens; allow 60 s of clock skew forward.
    if (now - ts > SESSION_MAX_AGE_SECONDS || ts > now + 60) return false;

    const sigBytes = hexToBytes(hmacHex);
    if (sigBytes.length === 0) return false;

    const key = await importHmacKey(secret);
    const enc = new TextEncoder();
    return await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer.slice(
        sigBytes.byteOffset,
        sigBytes.byteOffset + sigBytes.byteLength,
      ) as ArrayBuffer,
      enc.encode(`auth:${ts}`),
    );
  } catch {
    return false;
  }
}

/**
 * Returns the signing secret.
 * Prefers SESSION_SECRET; falls back to DASHBOARD_PASSWORD so a separate
 * secret is optional for simple single-user deploys.
 */
export function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD ?? "";
}
