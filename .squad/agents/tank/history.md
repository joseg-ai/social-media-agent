# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster ingesting Microsoft RSS feeds and learn.microsoft.com articles, posting at smart times.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. Persistence + scheduling TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own database schema and ORM spike resolution
- **IDs you own:** Foundation wave (schema design, migrations, feed_sources table, prompts table, llm_calls table for token tracking)
- **Reference:** .squad/decisions/decisions.md contains all schema requirements (Q5-Q9) and all resolved decisions (Q1-Q9)


### 2026-05-05 — WI-19: LinkedIn OAuth 2.0 flow

**Branch:** `squad/wi-19-linkedin-oauth` | **PR:** https://github.com/joseg-ai/social-media-agent/pull/7

#### What I built

Three API routes + three lib modules covering the full OAuth authorization code flow:

| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt. Format: `iv:ciphertext:authTag` (all base64, self-contained per token column). 12-byte random IV per call. Key from `LINKEDIN_TOKEN_ENCRYPTION_KEY`. |
| `src/lib/linkedin/oauth.ts` | `getAuthorizationUrl`, `exchangeCodeForToken`, `refreshAccessToken`. Standard fetch only. |
| `src/lib/linkedin/tokens.ts` | `storeTokenResponse` (UPSERT with onConflictDoUpdate), `getValidAccessToken` (auto-refresh 5-min window), `isLinkedInConnected`. |
| `GET /api/linkedin/auth` | Random 32-byte hex state → HttpOnly SameSite=Lax cookie → redirect to LinkedIn. |
| `GET /api/linkedin/callback` | `timingSafeEqual` state check → code exchange → encrypt → UPSERT → clear cookie → redirect. |
| `POST /api/linkedin/disconnect` | Delete `oauth_tokens` row, redirect to `/?linkedin=disconnected`. |

#### Scope rationale

`openid profile w_member_social`:
- `openid` + `profile` — OpenID Connect, gives id_token + user identity (sub, name) for future dashboard display.
- `w_member_social` — post on the member's behalf; required for WI-12.
- Refresh tokens are optional — LinkedIn issues them for the "Sign In with LinkedIn using OpenID Connect" product configuration. Code handles them if present but does not require them.

#### Encryption strategy

- `encryptToken(plaintext)` → `iv_b64:ciphertext_b64:authTag_b64` (compound, self-contained).
- Both `encrypted_access_token` and `encrypted_refresh_token` store the full compound string.
- `iv` and `auth_tag` schema columns hold the access token's IV and auth tag separately — tooling/key-rotation convenience, not needed for decryption.
- `parseEncryptedToken()` helper extracts the parts for DB column mapping.

#### Refresh strategy

`getValidAccessToken()`:
1. Read row from DB.
2. If `expiresAt - now < 5 min` AND refresh token exists → call `refreshAccessToken` → `storeTokenResponse`.
3. If refresh fails but token is still valid → return current token (graceful degradation).
4. If refresh fails and token is expired → throw with reconnect instruction.

#### DB dependency

`src/db/schema.ts` on this branch is a **soft-import** (oauth_tokens only). Full schema is in PR #6. Rebase required after #6 merges. Startup check in `tokens.ts` throws a clear error if the table is missing.

#### env.ts change

Added `SKIP_ENV_VALIDATION=1` support. Required for CI builds where env vars are injected at runtime. Standard T3-stack pattern. No breaking change — validation still runs in dev/prod when the flag is absent.
