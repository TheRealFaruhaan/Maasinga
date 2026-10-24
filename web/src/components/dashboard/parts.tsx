"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLink, Globe, MoreHorizontal, Phone } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { appHref, appLinks, detectPlatform, type AppLink, type Platform } from "@/lib/apps";
import type { Island } from "@/lib/islands";
import { useApi, type Hotline } from "@/lib/api";
import { getAtoll } from "@/lib/islands";

/** The device platform; "other" during SSR, the real one after hydration. */
export function usePlatform(): Platform {
  return useSyncExternalStore(
    () => () => {},
    detectPlatform,
    () => "other",
  );
}

/**
 * Marks content the API doesn't provide yet (hand-written in the app, or not
 * available at all). Every use is listed in web/API_GAPS.md.
 */
export function ApiGap({ children, block }: { children?: React.ReactNode; block?: boolean }) {
  const { t } = useLang();
  if (block) {
    return (
      <div className="rounded-[22px] border-2 border-dashed border-amber-300/50 bg-amber-300/10 px-5 py-5 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-950">
          {t.notInApi}
        </span>
        {children && <p className="mt-2 text-[13px] leading-snug text-white/75">{children}</p>}
      </div>
    );
  }
  return (
    <span
      title={typeof children === "string" ? children : undefined}
      className="inline-flex shrink-0 items-center rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 normal-case"
    >
      {t.notInApi}
    </span>
  );
}

export function DashSection({
  title,
  children,
  gap,
}: {
  title: string;
  children: React.ReactNode;
  /** Set when this section's data isn't from the API yet: what's missing. */
  gap?: string;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">{title}</h3>
        {gap && <ApiGap>{gap}</ApiGap>}
      </div>
      {gap && <p className="-mt-1 mb-2.5 px-1 text-[11px] leading-snug text-amber-200/80">{gap}</p>}
      {children}
    </section>
  );
}

/** Big island header: code, names, atoll. */
export function IslandHero({ island, title, subtitle }: { island: Island; title?: string; subtitle?: string }) {
  const { lang } = useLang();
  const atoll = getAtoll(island.atoll);
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-white/12 px-5 py-5 text-white ring-1 ring-white/15">
      <div className="font-display text-[44px] font-extrabold leading-none opacity-25">
        <span dir="ltr">{island.code}</span>
      </div>
      <div className="mt-2 text-[26px] font-bold leading-tight">
        {title ?? (lang === "dv" ? island.name_dv : island.name_en)}
      </div>
      <div className="mt-0.5 text-sm text-white/65">
        {subtitle ?? (lang === "dv" ? atoll?.name_dv : `${atoll?.name_en} Atoll`)}
      </div>
      <div className="pointer-events-none absolute end-5 top-4 font-thaana text-[34px] leading-none text-white/15">
        {lang === "dv" ? island.name_en : island.name_dv}
      </div>
    </div>
  );
}

/** An app with an Open button that deep links on the person's device. */
export function AppTile({ app }: { app: AppLink }) {
  const { t, lang } = useLang();
  const platform = usePlatform();
  const href = appHref(app, platform);
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white p-3 text-brand-ink">
      <AppIcon app={app} className="size-12 rounded-[14px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{lang === "dv" ? app.name_dv : app.name}</span>
        <span className="block truncate text-[12px] text-brand-ink/55">{app.blurb[lang]}</span>
      </span>
      {app.hotline && (
        <a
          href={`tel:${app.hotline}`}
          aria-label={`${t.call} ${app.hotline}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"
        >
          <Phone className="size-4" />
        </a>
      )}
      {href && (
        <a
          href={href}
          target={href.startsWith("intent:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white"
        >
          {t.open}
          <ExternalLink className="size-3.5 opacity-80" />
        </a>
      )}
    </div>
  );
}

/** Tappable phone numbers in a tight grid. */
export function NumberGrid({ items }: { items: { id: string; number: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((n) => (
        <a
          key={n.id}
          href={`tel:${n.number}`}
          className="flex flex-col items-center rounded-[18px] bg-white/12 px-2 py-3 text-white ring-1 ring-white/15 active:bg-white/20"
        >
          <span className="font-display text-2xl font-extrabold leading-none" dir="ltr">
            {n.number}
          </span>
          <span className="mt-1 text-center text-[11px] leading-tight text-white/70">{n.label}</span>
        </a>
      ))}
    </div>
  );
}

/** Emergency numbers from the API (/hotlines?category=emergency). */
export function EmergencyNumbers() {
  const { t, lang } = useLang();
  const res = useApi<Hotline[]>("/hotlines?category=emergency");
  if (res.status === "error") return null;
  return (
    <DashSection title={t.emergency}>
      {res.status === "ok" ? (
        <NumberGrid items={res.data.map((e) => ({ id: e.id, number: e.number, label: e.name[lang] }))} />
      ) : (
        <div className="h-[76px] animate-pulse rounded-[18px] bg-white/10" />
      )}
    </DashSection>
  );
}

/** The app's store icon, or its initials on its colour if there is none. */
export function AppIcon({ app, className }: { app: AppLink; className?: string }) {
  if (app.icon) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny local icons, no optimisation needed
    return <img src={app.icon} alt="" className={`shrink-0 object-cover ring-1 ring-black/5 ${className ?? ""}`} />;
  }
  return (
    <span
      className={`grid shrink-0 place-items-center font-display text-sm font-extrabold text-white ${className ?? ""}`}
      style={{ background: app.color }}
      dir="ltr"
    >
      {app.initials}
    </span>
  );
}

/**
 * Apps as a grid of icons. Tapping a tile opens the app on this device; the
 * corner button lists the other ways in (call, App Store, Google Play, web).
 */
export function AppGrid({ apps }: { apps: AppLink[] }) {
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3">
      {apps.map((a) => (
        <AppGridTile key={a.id} app={a} menuOpen={menu === a.id} onMenu={(open) => setMenu(open ? a.id : null)} />
      ))}
    </div>
  );
}

function AppGridTile({ app, menuOpen, onMenu }: { app: AppLink; menuOpen: boolean; onMenu: (open: boolean) => void }) {
  const { t, lang } = useLang();
  const platform = usePlatform();
  const href = appHref(app, platform);
  const links = appLinks(app);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onMenu]);

  const items = [
    links.hotline && { key: "call", href: `tel:${links.hotline}`, Icon: Phone, label: `${t.call} ${links.hotline}` },
    links.appStore && { key: "ios", href: links.appStore, Icon: AppleGlyph, label: "App Store" },
    links.googlePlay && { key: "play", href: links.googlePlay, Icon: PlayGlyph, label: "Google Play" },
    links.website && { key: "web", href: links.website, Icon: Globe, label: t.website },
  ].filter(Boolean) as { key: string; href: string; Icon: React.ComponentType<{ className?: string }>; label: string }[];

  return (
    <div ref={ref} className={`relative ${menuOpen ? "z-20" : ""}`}>
      <a
        href={href}
        target={href?.startsWith("intent:") ? undefined : "_blank"}
        rel="noopener noreferrer"
        className="flex h-full flex-col items-center rounded-[22px] bg-white px-3 pb-3.5 pt-5 text-center text-brand-ink transition active:scale-[0.97]"
      >
        <AppIcon app={app} className="size-16 rounded-[18px] shadow-[0_6px_16px_-6px_rgba(5,20,90,0.35)]" />
        <span className="mt-2.5 w-full truncate text-[15px] font-bold">{lang === "dv" ? app.name_dv : app.name}</span>
        <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-brand-ink/50">{app.blurb[lang]}</span>
      </a>

      <button
        onClick={() => onMenu(!menuOpen)}
        aria-label={t.moreOptions}
        aria-expanded={menuOpen}
        className={`absolute end-2 top-2 grid size-8 place-items-center rounded-full transition ${
          menuOpen ? "bg-brand text-white" : "bg-brand-ink/[0.05] text-brand-ink/50"
        }`}
      >
        <MoreHorizontal className="size-4" />
      </button>

      <div
        role="menu"
        className={`absolute end-2 top-11 z-30 min-w-[170px] origin-top-right overflow-hidden rounded-[16px] bg-white py-1 text-brand-ink shadow-[0_18px_40px_-10px_rgba(5,20,90,0.45)] ring-1 ring-brand-ink/5 transition duration-200 ease-[cubic-bezier(.3,1.4,.5,1)] rtl:origin-top-left ${
          menuOpen ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
        }`}
      >
        {items.map(({ key, href: h, Icon, label }) => (
          <a
            key={key}
            role="menuitem"
            href={h}
            target={h.startsWith("tel:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={() => onMenu(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-medium active:bg-brand-ink/[0.05]"
          >
            <Icon className="size-4 text-brand" />
            <span dir={key === "call" ? undefined : "ltr"}>{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.27-.87-2.29-3.52ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.3-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.21Z" />
    </svg>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.2 2.6c-.25.26-.4.66-.4 1.18v16.44c0 .52.15.92.4 1.18l.06.06 9.2-9.2v-.22l-9.2-9.2-.06.06Zm12.33 12.4-3.07-3.07v-.22l3.07-3.07.07.04 3.64 2.07c1.04.59 1.04 1.56 0 2.15l-3.64 2.07-.07.04Zm.07-.04L13.46 11.8 4.2 21.06c.34.36.9.4 1.54.05l10.86-6.17m0-6.29L5.74 2.9c-.64-.36-1.2-.32-1.54.05l9.26 9.25 3.14-3.14Z" />
    </svg>
  );
}

/** Apps for a place from the API (/apps), as a grid of icons or as rows. */
export function PlaceApps({ place, category, layout }: { place: string; category: string; layout: "grid" | "rows" }) {
  const res = useApi<AppLink[]>(`/apps?category=${encodeURIComponent(category)}&place=${encodeURIComponent(place)}`);
  if (res.status === "error") return null;
  if (res.status !== "ok") {
    return layout === "grid" ? (
      <div className="grid grid-cols-2 gap-3">
        <div className="h-44 animate-pulse rounded-[22px] bg-white/10" />
        <div className="h-44 animate-pulse rounded-[22px] bg-white/10" />
      </div>
    ) : (
      <div className="h-[72px] animate-pulse rounded-[20px] bg-white/10" />
    );
  }
  if (layout === "grid") return <AppGrid apps={res.data} />;
  return (
    <div className="space-y-2">
      {res.data.map((a) => (
        <AppTile key={a.id} app={a} />
      ))}
    </div>
  );
}
