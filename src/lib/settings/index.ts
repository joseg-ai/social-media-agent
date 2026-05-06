/**
 * Settings helpers — WI-23
 *
 * Thin CRUD layer over the `settings` table (key + JSONB value).
 * No schema is enforced here; validation lives in the API route.
 *
 * Known keys for this module:
 *   max_posts_per_day    — number (default 1)
 *   min_gap_hours        — number (default 20)
 *   jitter_minutes       — number (default 30)
 *   posting_windows      — { days, startHour, endHour, tz }
 *   relevance_threshold  — number (default 70)
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** Keys exposed on the Settings page. */
export const SETTINGS_KEYS = [
  "max_posts_per_day",
  "min_gap_hours",
  "jitter_minutes",
  "posting_windows",
  "relevance_threshold",
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

/**
 * Read a single setting; returns defaultValue if the key is absent or
 * if the stored value cannot be used as-is.
 */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  if (rows.length === 0) return defaultValue;
  return rows[0].value as T;
}

/** Upsert a setting key → value (replaces any existing row). */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Read all settings page keys from the DB in a single query.
 * Missing keys are omitted from the result — callers should apply their own
 * defaults (e.g., the form component merges with FORM_DEFAULTS).
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...SETTINGS_KEYS]));

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
