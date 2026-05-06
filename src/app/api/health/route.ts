import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const uptime = process.uptime();

  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", uptime, db: "reachable" });
  } catch {
    return NextResponse.json(
      { status: "degraded", uptime, db: "unreachable" },
      { status: 503 },
    );
  }
}
