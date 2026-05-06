/**
 * GET  /api/prompts/[key]?version=N  — fetch a specific version's content
 *                                       (defaults to active version)
 * POST /api/prompts/[key]             — save new version
 *                                       Body: { content: string, notes?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getActivePromptByName,
  getPromptByNameAndVersion,
  listPromptHistoryByName,
  createPromptVersion,
  PromptNotFoundError,
} from "@/lib/prompts";

type Params = { params: Promise<{ key: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { key } = await params;
  const versionParam = request.nextUrl.searchParams.get("version");

  try {
    if (versionParam !== null) {
      const version = parseInt(versionParam, 10);
      if (isNaN(version) || version < 1) {
        return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
      }
      const prompt = await getPromptByNameAndVersion(key, version);
      return NextResponse.json(prompt);
    }

    const prompt = await getActivePromptByName(key);
    return NextResponse.json(prompt);
  } catch (err) {
    if (err instanceof PromptNotFoundError) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }
    console.error(`[GET /api/prompts/${key}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { key } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).content !== "string"
  ) {
    return NextResponse.json({ error: "Missing required field: content (string)" }, { status: 400 });
  }

  const { content, notes } = body as { content: string; notes?: unknown };

  if (content.trim().length === 0) {
    return NextResponse.json({ error: "content must not be empty" }, { status: 400 });
  }

  if (content.length > 100_000) {
    return NextResponse.json({ error: "content exceeds 100,000 character limit" }, { status: 400 });
  }

  if (notes !== undefined && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided" }, { status: 400 });
  }

  try {
    // Derive promptType from existing history — names are unique per type
    const history = await listPromptHistoryByName(key);
    if (history.length === 0) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const { promptType } = history[0];
    const created = await createPromptVersion({
      name: key,
      promptType,
      content,
      notes: typeof notes === "string" ? notes : undefined,
      activate: true,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error(`[POST /api/prompts/${key}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
