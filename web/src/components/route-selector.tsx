"use client";

import { ChevronDown, MapPin } from "lucide-react";
import type { Island } from "@/lib/islands";
import { getAtoll } from "@/lib/islands";
import { useLang } from "@/lib/i18n";

/** The destination picker. "From" lives in the top bar (LocationPill). */
export function DestinationSelector({ to, onPick }: { to: Island | undefined; onPick: () => void }) {
  const { t, lang } = useLang();
  const atoll = to ? getAtoll(to.atoll) : undefined;
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-[26px] bg-white p-4 text-start text-brand-ink shadow-[0_18px_40px_-18px_rgba(5,20,90,0.6)] transition active:scale-[0.99]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white">
        <MapPin className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t.to}</span>
        {to ? (
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="font-display text-2xl font-extrabold leading-none text-brand" dir="ltr">
              {to.code}
            </span>
            <span className="truncate text-[15px] font-semibold">
              {lang === "dv" ? to.name_dv : to.name_en}
              <span className="font-normal text-brand-ink/45">
                {" · "}
                {lang === "dv" ? atoll?.name_dv : atoll?.name_en}
              </span>
            </span>
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-[18px] font-semibold text-brand-ink/40">{t.whereTo}</span>
        )}
      </span>
      <ChevronDown className="size-5 shrink-0 text-brand-ink/30" />
    </button>
  );
}
