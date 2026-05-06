import { NextRequest, NextResponse } from "next/server";
import { approveDraft, InvalidStateTransitionError } from "@/lib/posts";
import { getPost } from "@/lib/posts/queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/posts/[id]/approve — approve a draft and schedule it.
 */
export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  try {
    const existing = await getPost(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await approveDraft(id);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      return NextResponse.json({ error: "Post is not in draft state — cannot approve" }, { status: 409 });
    }
    console.error(`[POST /api/posts/${id}/approve]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}