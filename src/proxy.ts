// Optimistic sign-in check before any page renders: no session cookie means
// a 307 to /login instead of an empty page shell. It does not check the
// session is valid; every page, action and route still does that itself.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: "ogserc-registry" }))
    return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except the sign-in page, the cron route, robots.txt and
  // static assets.
  matcher: [
    "/((?!login|api/jobs|robots.txt|_next/static|_next/image|favicon.ico).*)",
  ],
};
