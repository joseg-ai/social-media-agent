/**
 * Partial Drizzle schema — WI-19 soft-import.
 *
 * This file contains ONLY the `oauth_tokens` table, which is the subset
 * needed by WI-19 (LinkedIn OAuth). The full schema (all 7 tables) lives
 * in PR #6 (squad/wi-02-drizzle-schema). When that PR merges, this file
 * MUST be replaced with the full schema.ts from PR #6 during rebase.
 *
 * DO NOT add other tables here — they belong in PR #6.
 */
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  varchar,
  unique,
} from "drizzle-orm/pg-core";

// ── oauth_tokens ───────────────────────────────────────────────────────────────

/**
 * LinkedIn OAuth tokens — stored AES-256-GCM encrypted at rest.
 * One row per OAuth provider (only LinkedIn for v1). UNIQUE on `provider`.
 *
 * Encryption layout for each token column:
 *   Column value  = "iv_b64:ciphertext_b64:authTag_b64"  (self-contained)
 *   `iv`          = access token's IV (also in the compound string — kept for
 *                   tooling / key-rotation queries without full decryption)
 *   `auth_tag`    = access token's auth tag (same reason)
 *   `key_version` = which LINKEDIN_TOKEN_ENCRYPTION_KEY version was used
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull().default("linkedin"),
    /** Full "iv:ciphertext:authTag" compound string for the access token. */
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    /** Full "iv:ciphertext:authTag" compound string for the refresh token (if issued). */
    encryptedRefreshToken: text("encrypted_refresh_token"),
    /** Base64-encoded IV of the access token — stored separately for key-rotation tooling. */
    iv: varchar("iv", { length: 64 }).notNull(),
    /** Base64-encoded auth tag of the access token — stored separately for key-rotation tooling. */
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    /** Tracks which encryption key version was used — enables key rotation. */
    keyVersion: integer("key_version").notNull().default(1),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Single-user app: enforce one token set per OAuth provider.
    unique("oauth_tokens_provider_uq").on(t.provider),
  ],
);
