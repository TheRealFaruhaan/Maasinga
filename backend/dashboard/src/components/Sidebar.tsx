"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Anchor, BookOpen, LayoutDashboard, LogOut, Menu, Moon, Navigation, ShieldAlert, Sun, Users, Waves, WifiOff, X } from "lucide-react";
import { logout, useSession } from "@/lib/auth";
import { setTheme, useTheme } from "@/lib/theme";
import s from "./Sidebar.module.css";

const GROUPS = [
  {
    label: "Public",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/travel", label: "Plan a trip", icon: Navigation },
    ],
  },
  {
    label: "Authorities",
    links: [
      { href: "/sea", label: "Sea state", icon: Waves },
      { href: "/safety", label: "Safety", icon: ShieldAlert },
      { href: "/signal", label: "Signal", icon: WifiOff },
      { href: "/access", label: "Access", icon: Users },
      { href: "/harbour", label: "Harbour", icon: Anchor },
    ],
  },
  {
    label: "About",
    links: [{ href: "/method", label: "Method", icon: BookOpen }],
  },
];

const noop = () => () => {};
const isActive = (path: string | null, href: string) => !!path && (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function Mark({ size = 30 }: { size?: number }) {
  // A boat's wake over one swell: the product's mark.
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <defs>
        <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4cb3f0" />
          <stop offset="100%" stopColor="#1060b0" />
        </linearGradient>
      </defs>
      <circle cx="11" cy="11" r="11" fill="url(#mark)" />
      <path d="M4 13.5c2.3-2.6 4.7-2.6 7 0s4.7 2.6 7 0" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="7.5" r="1.8" fill="#ffffff" />
    </svg>
  );
}

function ThemeSwitch() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className={s.theme} onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}

function SignOut() {
  const session = useSession();
  const name = session && session !== "loading" ? session.user.username : "";
  return (
    <button className={s.theme} onClick={logout} aria-label="Sign out">
      <LogOut size={18} />
      <span>Sign out{name && <small className={s.who}> {name}</small>}</span>
    </button>
  );
}

export default function Sidebar() {
  // The shell is prerendered once for all pages, so the active link is marked after hydration.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const pathname = usePathname();
  const path = hydrated ? pathname : null;
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className={s.nav} aria-label="Main">
      {GROUPS.map((g) => (
        <div key={g.label} className={s.group}>
          <div className={s.groupLabel}>{g.label}</div>
          {g.links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={s.link} aria-current={isActive(path, href) ? "page" : undefined} onClick={() => setOpen(false)}>
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className={s.side}>
        <Link href="/" className={s.brand}>
          <Mark />
          <span>
            Maasinga
            <small>Maldives mobility</small>
          </span>
        </Link>
        {nav}
        <div className={s.foot}>
          <div className={s.data}>
            <span className={s.dot} />
            Boat data: August 2025
          </div>
          <ThemeSwitch />
          <SignOut />
        </div>
      </aside>

      <header className={s.mobile}>
        <Link href="/" className={s.brand}>
          <Mark size={26} />
          <span>Maasinga</span>
        </Link>
        <button className={s.menu} aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {open && (
        <div className={s.sheet}>
          {nav}
          <ThemeSwitch />
          <SignOut />
        </div>
      )}
    </>
  );
}
