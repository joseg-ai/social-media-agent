import { NextRequest, NextResponse } from "next/server";
import {
  getFeedSource,
  updateFeedSource,
  deleteFeedSource,
  DuplicateFeedSourceError,
} from "@/lib/feeds/sources";
import { updateFeedSourceSchema } from "@/lib/feeds/validators";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/feeds/[id] — get a single feed source. */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  try {
    const source = await getFeedSource(id);
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(source);
  } catch (err) {
    console.error(`[GET /api/feeds/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/feeds/[id] — update a feed source. Body: partial { name?, url?, isActive? } */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateFeedSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await updateFeedSource(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof DuplicateFeedSourceError) {
      return NextResponse.json(
        { error: "Duplicate URL", existing: err.existing },
        { status: 409 },
      );
    }
    console.error(`[PATCH /api/feeds/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/feeds/[id] — hard-delete a feed source (cascades to articles). */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const deleted = await deleteFeedSource(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`[DELETE /api/feeds/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
