import { NextRequest, NextResponse } from "next/server";
import { listFeedSources, createFeedSource, DuplicateFeedSourceError } from "@/lib/feeds/sources";
import { createFeedSourceSchema } from "@/lib/feeds/validators";

/** GET /api/feeds — list feed sources. Append ?all=1 to include inactive. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const includeInactive = request.nextUrl.searchParams.get("all") === "1";
    const sources = await listFeedSources({ includeInactive });
    return NextResponse.json(sources);
  } catch (err) {
    console.error("[GET /api/feeds]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/feeds — create a new feed source. Body: { name, url, isActive? } */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createFeedSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const source = await createFeedSource(parsed.data);
    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateFeedSourceError) {
      return NextResponse.json(
        { error: "Duplicate URL", existing: err.existing },
        { status: 409 },
      );
    }
    console.error("[POST /api/feeds]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
