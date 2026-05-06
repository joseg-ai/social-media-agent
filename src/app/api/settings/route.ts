/**
 * GET  /api/settings — returns current values for all known settings keys
 * PATCH /api/settings — upserts one or more keys; validates per-key with Zod
 *
 * Validation rules:
 *   max_posts_per_day   : integer 1..10
 *   min_gap_hours       : integer 0..168
 *   jitter_minutes      : integer 0..60
 *   posting_windows     : { days: number[] (0-6, unique), startHour 0..23,
 *                           endHour 0..23 (≠ startHour), tz: IANA string }
 *   relevance_threshold : integer 0..100
 *
 * Auth gate: covered by WI-13 middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";

// ── Validation schemas ─────────────────────────────────────────────────────────

const postingWindowsSchema = z
  .object({
    days: z
      .array(z.number().int().min(0).max(6))
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "days must contain unique values (0=Sun … 6=Sat)",
      }),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
    tz: z.string().refine(
      (tz) => {
        try {
          // Intl.supportedValuesOf is available in Node 18+ / V8 9.9+
          return (Intl as { supportedValuesOf?: (key: string) => string[] })
            .supportedValuesOf?.("timeZone")
            ?.includes(tz) ?? false;
        } catch {
          return false;
        }
      },
      { message: "tz must be a valid IANA time zone identifier" },
    ),
  })
  .refine((d) => d.startHour !== d.endHour, {
    message: "startHour and endHour must not be equal",
    path: ["endHour"],
  });

const patchSchema = z
  .object({
    max_posts_per_day: z.number().int().min(1).max(10).optional(),
    min_gap_hours: z.number().int().min(0).max(168).optional(),
    jitter_minutes: z.number().int().min(0).max(60).optional(),
    posting_windows: postingWindowsSchema.optional(),
    relevance_threshold: z.number().int().min(0).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Body must contain at least one settings key",
  });

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getAllSettings();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const entries = Object.entries(parsed.data).filter(
    ([, v]) => v !== undefined,
  ) as [string, unknown][];

  try {
    await Promise.all(entries.map(([key, value]) => setSetting(key, value)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
