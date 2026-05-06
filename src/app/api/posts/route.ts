import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/posts/queries";
import type { PostState } from "@/lib/posts/queries";

const VALID_STATES = new Set<PostState>([
  "draft", "scheduled", "posting", "posted", "failed", "cancelled",
]);

function parseStates(raw: string | null): PostState[] | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim());
  const states: PostState[] = [];
  for (const part of parts) {
    if (!VALID_STATES.has(part as PostState)) return null;
    states.push(part as PostState);
  }
  return states.length > 0 ? states : null;
}

/** GET /api/posts?state=draft,scheduled&limit=50&offset=0 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const rawState = searchParams.get("state");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  const states = parseStates(rawState) ?? (["draft", "scheduled"] as PostState[]);
  const historyStates: PostState[] = ["posted", "failed", "cancelled"];
  const isHistory = states.every((s) => historyStates.includes(s));

  try {
    const items = await listPosts({ states, limit, offset, orderBy: isHistory ? "history" : "queue" });
    return NextResponse.json(items);
  } catch (err) {
    console.error("[GET /api/posts]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}