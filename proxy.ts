import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken, ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Single enforcement point for "business support" access. The /admin UI
// hides itself without a session, but that's just convenience — the real
// gate is here, in front of both the page and the data APIs it calls, so
// hitting /api/tickets etc. directly without a session is rejected too.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in as business support." }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Proxy always runs on the Node.js runtime (unlike the old "middleware"
// convention, which defaulted to the Edge runtime and doesn't support
// Node's `crypto` — needed here for HMAC session verification).
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/tickets/:path*", "/api/query-log/:path*", "/api/audit-log/:path*"],
};
