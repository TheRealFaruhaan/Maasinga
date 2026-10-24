import { NextResponse, type NextRequest } from "next/server";
import { API_BASE, setSession, tokenFrom } from "@/lib/policy-session";

export async function POST(req: NextRequest) {
  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!username || !password) return NextResponse.json({ detail: "Enter a username and password" }, { status: 400 });

  let r: Response;
  try {
    r = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Couldn't reach the API" }, { status: 502 });
  }
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = (body as { detail?: string } | null)?.detail ?? "Login failed";
    return NextResponse.json({ detail }, { status: r.status === 401 ? 401 : 502 });
  }
  const token = tokenFrom(body);
  if (!token) return NextResponse.json({ detail: "The API's login answer had no token" }, { status: 502 });

  const res = NextResponse.json({ ok: true });
  setSession(req, res, token);
  return res;
}
