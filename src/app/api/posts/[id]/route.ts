import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { getPost } from "@/lib/posts/queries";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  try {
    const post = await getPost(id);
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(post);
  } catch (err) {
    console.error(`[GET /api/posts/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("body" in body) ||
      typeof (body as { body: unknown }).body !== "string") {
    return NextResponse.json({ error: "body must be a string" }, { status: 400 });
  }
  const newBody = (body as { body: string }).body;
  try {
    const existing = await getPost(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.state !== "draft") {
      return NextResponse.json({ error: "Post is not in draft state", state: existing.state }, { status: 409 });
    }
    await db.update(posts).set({ editedText: newBody, updatedAt: new Date() }).where(eq(posts.id, id));
    const updated = await getPost(id);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH /api/posts/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/[id] — cancel a post.
 * TODO(WI-11): Replace direct DB update with cancelPost(id, reason) from
 * src/lib/posts/state-machine.ts once Tank'\''s WI-11 lands.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  let reason: string | undefined;
  try {
    const rawBody = await request.json();
    if (typeof rawBody === "object" && rawBody !== null && "reason" in rawBody) {
      reason = String((rawBody as { reason: unknown }).reason);
    }
  } catch { /* no body is fine */ }
  try {
    const existing = await getPost(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // TODO(WI-11): replace with cancelPost(id, reason)
    await db.update(posts).set({ state: "cancelled", failureReason: reason ?? null, updatedAt: new Date() }).where(eq(posts.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`[DELETE /api/posts/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}