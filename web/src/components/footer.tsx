"use client";

import { useLang } from "@/lib/i18n";
import { PROVIDERS, withLogo, type Provider } from "@/lib/providers";

/** One source as a small tile: logo on top, what it provides underneath. */
function ProviderTile({ p, hidden }: { p: Provider; hidden?: boolean }) {
  const { lang } = useLang();
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      title={p.name}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className={`flex h-[68px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] px-3 text-center ${
        p.dark ? "bg-brand-ink text-white" : "bg-white text-brand-ink"
      } ${p.wide ? "w-[168px]" : p.iconOnly ? "w-[140px]" : "w-[112px]"}`}
    >
      <span className="flex h-7 w-full items-center justify-center gap-1">
        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- small static logos
          <img
            src={p.logo}
            alt={p.iconOnly ? "" : p.name}
            className={`object-contain ${p.iconOnly ? "h-5 w-5" : "max-h-7 max-w-full"}`}
          />
        )}
        {(!p.logo || p.iconOnly) && (
          <span className="truncate font-display text-[11px] font-extrabold leading-tight">{p.name}</span>
        )}
      </span>
      <span className={`w-full truncate text-[9.5px] leading-tight ${p.dark ? "text-white/55" : "text-brand-ink/50"}`}>
        {p.what[lang]}
      </span>
    </a>
  );
}

/**
 * The organisations whose data the app shows, as a narrow strip of small tiles that scrolls
 * on an endless loop (the row is drawn twice, so it wraps without a jump).
 * Pauses on hover / touch; with reduced motion it stays still and swipes.
 */
export function Footer() {
  const { t } = useLang();
  const providers = PROVIDERS.map(withLogo);
  return (
    <footer className="mt-12 border-t border-white/10 pt-6 text-white">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">{t.dataFrom}</h2>
      <div
        dir="ltr"
        className="group relative -mx-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%-24px),transparent)] motion-reduce:overflow-x-auto"
      >
        <div className="flex w-max animate-[maas-marquee_38s_linear_infinite] group-hover:[animation-play-state:paused] group-active:[animation-play-state:paused] motion-reduce:animate-none">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-2 pe-2" aria-hidden={copy === 1 || undefined}>
              {providers.map((p) => (
                <ProviderTile key={p.id} p={p} hidden={copy === 1} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 font-display text-sm font-extrabold text-white/70">Maasinga</p>
    </footer>
  );
}
