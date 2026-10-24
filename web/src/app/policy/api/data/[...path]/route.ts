import { NextResponse, type NextRequest } from "next/server";
import { API_BASE, clearSession, POLICY_COOKIE } from "@/lib/policy-session";

// Only these API paths can be reached through the dashboard.
const ALLOWED = [/^auth\/me$/, /^network$/, /^sea$/, /^safety$/, /^signal$/, /^harbour$/, /^boats(\/[0-9A-F]{6})?$/, /^trips$/, /^bus-ridership$/, /^bus-routes$/];

export async function GET(req: NextRequest, ctx: RouteContext<"/policy/api/data/[...path]">) {
  const { path } = await ctx.params;
  const p = path.join("/");
  if (!ALLOWED.some((re) => re.test(p))) return NextResponse.json({ detail: "Not available" }, { status: 404 });

  const token = req.cookies.get(POLICY_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Login needed" }, { status: 401 });

  let r: Response;
  try {
    r = await fetch(`${API_BASE}/${p}${req.nextUrl.search}`, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "gzip" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Couldn't reach the API" }, { status: 502 });
  }
  const res = new NextResponse(r.body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "application/json", "Cache-Control": "private, no-store" },
  });
  if (r.status === 401) clearSession(res); // expired or revoked: log out
  return res;
}
