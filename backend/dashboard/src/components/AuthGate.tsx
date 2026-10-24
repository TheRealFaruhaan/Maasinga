"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { login, useSession } from "@/lib/auth";
import { Mark } from "./Sidebar";
import s from "./AuthGate.module.css";

/** The dashboard needs a login: without a session it shows the sign-in screen instead of the pages. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === "loading") return null;
  if (!session) return <SignIn />;
  return <>{children}</>;
}

function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <form className={s.card} onSubmit={submit}>
        <div className={s.brand}>
          <Mark size={40} />
          <div>
            <h1>Maasinga</h1>
            <p>Maldives mobility</p>
          </div>
        </div>
        <label className={s.field}>
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className={s.field}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button className={s.submit} disabled={busy}>
          {busy ? <LoaderCircle size={18} className={s.spin} /> : <LockKeyhole size={18} />}
          Sign in
        </button>
      </form>
    </main>
  );
}
