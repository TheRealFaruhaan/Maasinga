import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate for the policy dashboard: no session cookie, no pages.
// (The real check is the API rejecting a bad token; see app/policy/api.)
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/policy/login") || pathname.startsWith("/policy/api/")) return NextResponse.next();
  if (!req.cookies.get("maasinga_policy")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/policy/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/policy", "/policy/:path*"] };
