/**
 * Postgres advisory lock primitive for single-instance job execution.
 *
 * Uses session-level pg_try_advisory_lock so that only one instance of a job
 * runs at a time across multiple app instances sharing the same database.
 *
 * Connection safety: acquires a reserved connection from the pool so that both
 * the lock acquisition and the release happen on the exact same Postgres session.
 * Advisory locks are per-session in Postgres — mixing connections would silently
 * skip the unlock.
 */
import { createHash } from "crypto";
import { db } from "@/db";

/**
 * Derive a stable positive int8 lock key from a human-readable job name.
 * Uses the first 15 hex chars of SHA-256 (60 bits) which fits safely inside
 * Postgres's signed bigint range (~4.6 × 10¹⁸ max positive).
 */
export function jobLockKey(name: string): bigint {
  const hex = createHash("sha256").update(name).digest("hex").slice(0, 15);
  return BigInt("0x" + hex);
}

/**
 * Try to acquire a session-level Postgres advisory lock, run `fn`, then release.
 *
 * @returns The return value of `fn` if the lock was acquired, or `null` if
 *          another instance already holds the lock (i.e. job is already running).
 * @throws  Any error thrown by `fn` (after releasing the lock).
 */
export async function withAdvisoryLock<T>(
  lockKey: bigint | number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const key = (typeof lockKey === "number" ? BigInt(lockKey) : lockKey).toString();
  const sql = db.$client;

  // Reserve a single connection so lock + unlock share the same Postgres session.
  const conn = await sql.reserve();
  try {
    const [{ acquired }] = await conn<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${key}::bigint) AS acquired
    `;

    if (!acquired) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await conn`SELECT pg_advisory_unlock(${key}::bigint)`;
    }
  } finally {
    conn.release();
  }
}
