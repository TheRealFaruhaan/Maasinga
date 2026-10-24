"use client";

import { useSyncExternalStore } from "react";

/** The logged-in user and the API token, kept in localStorage so a reload keeps the session. */
export type Session = { token: string; expiresAt: number; user: { username: string; role: "policy" | "admin" } };

const KEY = "maasinga.session";
const EVENT = "maasinga-session";
export const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // logout in another tab
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function save(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** "loading" until the browser has read the saved session (the server never knows it). */
export function useSession(): Session | null | "loading" {
  const raw = useSyncExternalStore(subscribe, read, () => "loading");
  if (raw === "loading") return "loading";
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function token() {
  const raw = read();
  return raw ? (JSON.parse(raw) as Session).token : null;
}

export async function login(username: string, password: string) {
  if (!API) throw new Error("The API address is not set (NEXT_PUBLIC_API_URL).");
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (r.status === 401) throw new Error("Wrong username or password.");
  if (!r.ok) throw new Error(`The API answered ${r.status}. Try again.`);
  const j = await r.json();
  save({ token: j.access_token, expiresAt: j.expires_at, user: j.user });
}

export function logout() {
  save(null);
}
