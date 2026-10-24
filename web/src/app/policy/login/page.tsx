"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function PolicyLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/policy/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) return router.replace("/policy");
    const body = (await r?.json().catch(() => null)) as { detail?: string } | null;
    setError(body?.detail ?? "Couldn't log in. Try again.");
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[24px] bg-white p-7 shadow-[0_24px_60px_-30px_rgba(5,20,90,0.5)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#1f3fd6] text-white">
            <Lock className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-extrabold">Maasinga Policy</h1>
            <p className="text-[13px] text-[#0b1a66]/55">For organisation users</p>
          </div>
        </div>
        <label className="block text-[13px] font-semibold">
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#0b1a66]/15 px-3.5 text-[15px] font-normal outline-none focus:border-[#1f3fd6] focus:ring-2 focus:ring-[#1f3fd6]/20"
          />
        </label>
        <label className="mt-4 block text-[13px] font-semibold">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#0b1a66]/15 px-3.5 text-[15px] font-normal outline-none focus:border-[#1f3fd6] focus:ring-2 focus:ring-[#1f3fd6]/20"
          />
        </label>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">{error}</p>}
        <button
          disabled={busy || !username || !password}
          className="mt-6 h-11 w-full rounded-xl bg-[#1f3fd6] font-semibold text-white transition disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
