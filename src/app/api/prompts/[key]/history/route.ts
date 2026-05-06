/**
 * GET /api/prompts/[key]/history
 *
 * Returns all versions for a prompt key (newest first), each with id, version,
 * isActive, notes, and createdAt. Used by the version history sidebar (WI-16).
 */
import { NextResponse } from "next/server";
import { listPromptHistoryByName, PromptNotFoundError } from "@/lib/prompts";

type Params = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { key } = await params;

  try {
    const history = await listPromptHistoryByName(key);
    if (history.length === 0) {
      throw new PromptNotFoundError(`No prompt found for name="${key}"`);
    }

    const summary = history.map(({ id, version, isActive, notes, createdAt }) => ({
      id,
      version,
      isActive,
      notes,
      createdAt,
    }));

    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof PromptNotFoundError) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }
    console.error(`[GET /api/prompts/${key}/history]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
