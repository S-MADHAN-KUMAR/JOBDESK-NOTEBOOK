import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Edge guard for every request (Next 16 renamed `middleware` → `proxy`).
 * Verified sessions pass through; pages bounce to /login, APIs answer 401.
 */

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

// Files Next serves directly — no point running the session check on them.
const STATIC_PREFIXES = ["/_next/", "/favicon", "/robots", "/icon", "/apple-touch", "/opengraph"];

/** Anything with a file extension is an asset, not a route (`/logo.jpeg`, `/manifest.json`…). */
const ASSET = /\.[a-z0-9]{2,5}$/i;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (ASSET.test(pathname)) return true;
  return STATIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static assets (any extension) and Next's own bundles.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-z0-9]{2,5}$).*)"],
};
