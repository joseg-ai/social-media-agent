/**
 * POST /api/prompts/[key]/activate
 *
 * Activate a specific older version for rollback.
 * Body: { version: number }
 *
 * Atomically deactivates the current active version and activates the target.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  listPromptHistoryByName,
  activatePromptVersion,
  PromptNotFoundError,
} from "@/lib/prompts";

type Params = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { key } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const version = (body as Record<string, unknown>)?.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return NextResponse.json(
      { error: "Missing or invalid field: version (positive integer required)" },
      { status: 400 }
    );
  }

  try {
    const history = await listPromptHistoryByName(key);
    if (history.length === 0) {
      throw new PromptNotFoundError(`No prompt found for name="${key}"`);
    }

    const target = history.find((p) => p.version === version);
    if (!target) {
      return NextResponse.json(
        { error: `Version ${version} not found for prompt "${key}"` },
        { status: 404 }
      );
    }

    await activatePromptVersion(target.id);
    return NextResponse.json({ ok: true, activatedVersion: version });
  } catch (err) {
    if (err instanceof PromptNotFoundError) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }
    console.error(`[POST /api/prompts/${key}/activate]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
