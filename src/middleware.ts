import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, getSessionSecret } from "@/lib/auth";

/**
 * Paths that bypass authentication.
 * - /login          — the login page itself
 * - /api/auth/*     — login + logout API routes
 * - /api/health     — Azure load balancer + uptime monitor probe (no auth)
 * All other paths are gated.
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health"
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const secret = getSessionSecret();
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  // Redirect to /login — no `from` param to keep the URL clean (single-user).
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (Next.js build assets)
     *  - _next/image   (Next.js image optimization)
     *  - favicon.ico
     *  - common static file extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
