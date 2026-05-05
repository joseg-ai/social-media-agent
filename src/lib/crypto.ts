/**
 * AES-256-GCM token encryption/decryption — WI-19.
 *
 * Node.js crypto only — do NOT import this in Edge routes or client components.
 *
 * Token format: "iv_b64:ciphertext_b64:authTag_b64"
 *   - iv         : 12-byte random GCM initialization vector (base64)
 *   - ciphertext : AES-GCM encrypted payload (base64)
 *   - authTag    : 16-byte GCM authentication tag (base64)
 *
 * Key source: LINKEDIN_TOKEN_ENCRYPTION_KEY env var (32-byte base64 string).
 * Generate:   openssl rand -base64 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // Recommended for GCM: 96-bit IV

function getKey(): Buffer {
  return Buffer.from(env.LINKEDIN_TOKEN_ENCRYPTION_KEY, "base64");
}

/**
 * Encrypts a plaintext string with AES-256-GCM using a fresh random IV.
 * Returns a self-contained "iv:ciphertext:authTag" string (all parts base64).
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), ciphertext.toString("base64"), authTag.toString("base64")].join(
    ":",
  );
}

/**
 * Decrypts a token produced by encryptToken.
 * Throws if the format is invalid or the authentication tag fails.
 */
export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format — expected iv:ciphertext:authTag");
  }
  const [ivB64, ciphertextB64, authTagB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Parses the compound "iv:ciphertext:authTag" string into its components.
 * Useful when storing to a DB schema that keeps iv/authTag in separate columns.
 */
export function parseEncryptedToken(encrypted: string): {
  iv: string;
  ciphertext: string;
  authTag: string;
} {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format — expected iv:ciphertext:authTag");
  }
  const [iv, ciphertext, authTag] = parts;
  return { iv, ciphertext, authTag };
}
