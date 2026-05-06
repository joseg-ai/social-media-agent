/**
 * GET /api/prompts
 *
 * Returns all prompt keys with their active version number, total version count,
 * and notes. Used by the prompts list page (WI-16).
 */
import { NextResponse } from "next/server";
import { listAllPromptKeys } from "@/lib/prompts";

export async function GET(): Promise<NextResponse> {
  try {
    const keys = await listAllPromptKeys();
    return NextResponse.json(keys);
  } catch (err) {
    console.error("[GET /api/prompts]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
