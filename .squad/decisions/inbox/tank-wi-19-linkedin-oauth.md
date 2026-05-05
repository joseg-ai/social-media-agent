# Decision: WI-19 — LinkedIn OAuth Scope, Encryption API, and PR #6 Dependency

**Author:** Tank
**Date:** 2026-05-05
**Branch:** squad/wi-19-linkedin-oauth
**PR:** https://github.com/joseg-ai/social-media-agent/pull/7

---

## OAuth Scopes

Scopes requested: `openid profile w_member_social`

| Scope | Reason |
|-------|--------|
| `openid` | OpenID Connect — enables `id_token` and userinfo endpoint. Required for LinkedIn OIDC product which is also needed to get refresh tokens. |
| `profile` | Display name + profile photo. Required alongside `openid`. Future dashboard use. |
| `w_member_social` | Post to LinkedIn on the member's behalf. Required for WI-12 posting service. |

**Refresh tokens:** LinkedIn issues them for apps configured under the "Sign In with LinkedIn using OpenID Connect" product. Code handles `refresh_token` if present but does not require it.

---

## Encryption Module API (`src/lib/crypto.ts`)

```typescript
encryptToken(plaintext: string): string
// Returns "iv_b64:ciphertext_b64:authTag_b64"
// - 12-byte random IV per call (GCM standard)
// - AES-256-GCM using 32-byte key from LINKEDIN_TOKEN_ENCRYPTION_KEY
// - Self-contained: each token column can be decrypted independently

decryptToken(encrypted: string): string
// Parses the compound string and decrypts. Throws on invalid format or auth tag mismatch.

parseEncryptedToken(encrypted: string): { iv: string; ciphertext: string; authTag: string }
// Splits the compound string into parts for DB column mapping.
```

Key rotation path: increment `key_version`, decrypt with old key, re-encrypt with new key, update row.

---

## DB Storage Layout

Each token column stores the full compound `iv:ciphertext:authTag` string.
The `iv` and `auth_tag` schema columns hold the access token parts separately — for key-rotation tooling that needs to query by iv/version without full decryption.

---

## Dependency on PR #6

This PR depends on PR #6 (`squad/wi-02-drizzle-schema`) for the `oauth_tokens` table.

`src/db/schema.ts` on the WI-19 branch is a partial soft-import (oauth_tokens only).
After PR #6 merges, the schema.ts must be replaced with the full 7-table version from PR #6.

A startup check in `tokens.ts` (`assertTableExists`) throws a clear error if `oauth_tokens` is missing, directing the operator to run `npm run db:migrate`.

**Merge order:** PR #6 must merge before PR #7 is usable. If PR #7 merges first, migrations must be run before any LinkedIn routes are called.

---

## CI Build Pattern

Added `SKIP_ENV_VALIDATION=1` support to `src/lib/env.ts`. Set this flag in CI pipelines where env vars are injected at runtime rather than build time. Build: `SKIP_ENV_VALIDATION=1 npm run build`.