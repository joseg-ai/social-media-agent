import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, getSessionSecret } from "@/lib/auth";

// TODO: Add rate limiting here for production hardening.
// Single-user setup makes brute-force low-risk, but it's worth revisiting.

export async function POST(request: NextRequest): Promise<NextResponse> {
  let password: string;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Constant-time comparison. crypto.timingSafeEqual requires equal-length Buffers.
  // If lengths differ we still run the compare (on padded buffers) to avoid leaking
  // whether the guess was too short or too long via timing.
  const expected = Buffer.from(env.DASHBOARD_PASSWORD, "utf8");
  const actual = Buffer.from(password, "utf8");

  let match: boolean;
  if (actual.length === expected.length) {
    match = crypto.timingSafeEqual(actual, expected);
  } else {
    // Lengths differ — always false, but we spend the same time computing.
    const maxLen = Math.max(actual.length, expected.length);
    const paddedActual = Buffer.concat([actual, Buffer.alloc(maxLen - actual.length)]);
    const paddedExpected = Buffer.concat([expected, Buffer.alloc(maxLen - expected.length)]);
    crypto.timingSafeEqual(paddedActual, paddedExpected); // result discarded
    match = false;
  }

  if (!match) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const secret = getSessionSecret();
  const token = await createSessionToken(secret);
  const isProduction = env.NODE_ENV === "production";

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
