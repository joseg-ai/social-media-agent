import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { getPost } from "@/lib/posts/queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/posts/[id]/approve — approve a draft and schedule it.
 * TODO(WI-11): swap direct UPDATE for approveDraft(id) once WI-11 lands.
 */
export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  try {
    const existing = await getPost(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.state !== "draft") {
      return NextResponse.json({ error: "Post is not in draft state", state: existing.state }, { status: 409 });
    }
    // TODO(WI-11): replace with approveDraft(id) from state-machine.ts.
    await db.update(posts)
      .set({ state: "scheduled", scheduledFor: new Date(), updatedAt: new Date() })
      .where(eq(posts.id, id));
    const updated = await getPost(id);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[POST /api/posts/${id}/approve]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}