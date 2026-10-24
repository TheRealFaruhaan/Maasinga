"use client";

import { useLang } from "@/lib/i18n";
import { PROVIDERS, withLogo, type Provider } from "@/lib/providers";

function ProviderTile({ p }: { p: Provider }) {
  const { lang } = useLang();
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      title={p.name}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-[18px] px-2 py-3 text-center transition active:scale-[0.97] ${
        p.dark ? "bg-brand-ink text-white" : "bg-white text-brand-ink"
      } ${p.wide ? "col-span-2" : ""}`}
    >
      <span className="flex h-10 w-full items-center justify-center gap-1.5">
        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- small static logos
          <img
            src={p.logo}
            alt={p.iconOnly ? "" : p.name}
            className={`object-contain ${p.iconOnly ? "h-7 w-7" : p.wide ? "max-h-10 max-w-[92%]" : "max-h-10 max-w-[85%]"}`}
          />
        )}
        {(!p.logo || p.iconOnly) && (
          <span className="font-display text-[13px] font-extrabold leading-tight">{p.name}</span>
        )}
      </span>
      <span className={`text-[10.5px] leading-tight ${p.dark ? "text-white/55" : "text-brand-ink/50"}`}>{p.what[lang]}</span>
    </a>
  );
}

/** The organisations whose data the app shows. */
export function Footer() {
  const { t } = useLang();
  return (
    <footer className="mt-12 border-t border-white/10 pt-8 text-white">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">{t.dataFrom}</h2>
      <div className="mt-3 grid grid-flow-row-dense grid-cols-3 gap-2">
        {PROVIDERS.map((p) => (
          <ProviderTile key={p.id} p={withLogo(p)} />
        ))}
      </div>
      <p className="mt-6 font-display text-sm font-extrabold text-white/70">Maasinga</p>
    </footer>
  );
}
