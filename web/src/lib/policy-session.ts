// Server side of the policy dashboard's login. The API issues a bearer token
// (POST /auth/login); we keep it in an httpOnly cookie so page scripts never
// see it, and every API call goes through our own route handlers.
import "server-only";
import type { NextRequest, NextResponse } from "next/server";

export const POLICY_COOKIE = "maasinga_policy";
const MAX_AGE = 8 * 60 * 60; // 8 h; the API may expire tokens sooner (then we get 401 and log out)

export const API_BASE = process.env.MAASINGA_API || process.env.NEXT_PUBLIC_MAASINGA_API || "https://maasinga-api.devoup.com";

const isHttps = (req: NextRequest) =>
  req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

export function setSession(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(POLICY_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "strict",
    path: "/policy",
    maxAge: MAX_AGE,
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(POLICY_COOKIE, "", { httpOnly: true, path: "/policy", maxAge: 0 });
}

/** The token from whatever shape the login response has. */
export function tokenFrom(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const t = b.token ?? b.access_token ?? b.accessToken;
  return typeof t === "string" && t ? t : null;
}
