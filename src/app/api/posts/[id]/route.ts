import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { getPost } from "@/lib/posts/queries";
import { cancelPost, InvalidStateTransitionError } from "@/lib/posts";

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
 */
export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  let reason: string | undefined;
  try {
    const rawBody = await request.json();
    if (typeof rawBody === "object" && rawBody !== null && "reason" in rawBody) {
      const raw = (rawBody as { reason: unknown }).reason;
      if (typeof raw !== "string") {
        return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
      }
      if (raw.length > 500) {
        return NextResponse.json({ error: "reason must be 500 characters or fewer" }, { status: 400 });
      }
      reason = raw;
    }
  } catch { /* no body is fine */ }
  try {
    const existing = await getPost(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await cancelPost(id, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      return NextResponse.json(
        { error: "Post is currently being submitted or already in a terminal state — cannot cancel" },
        { status: 409 },
      );
    }
    console.error(`[DELETE /api/posts/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}