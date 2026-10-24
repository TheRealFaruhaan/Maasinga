"use client";

import { ArrowRight, Bus, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { RTL_APP, TAXI_APPS } from "@/lib/apps";
import { AIRPORT_TAXI, BUS_ROUTES } from "@/lib/male";
import { AppGrid, AppTile, DashSection, EmergencyNumbers, NumberGrid } from "./parts";

/** Custom dashboard for Malé City (Malé, Hulhumalé, Villimalé). */
export function MaleDashboard() {
  const { t, lang } = useLang();
  return (
    <div>
      <DashSection title={t.taxi}>
        <AppGrid apps={TAXI_APPS} />
      </DashSection>

      <DashSection title={t.busRoutes}>
        <div className="overflow-hidden rounded-[22px] bg-white text-brand-ink">
          {BUS_ROUTES.map((r) => (
            <div key={r.code} className="flex items-center gap-3 border-b border-brand-ink/[0.06] px-3.5 py-3 last:border-0">
              <span
                className="grid h-9 min-w-12 place-items-center rounded-[10px] px-2 font-display text-[15px] font-extrabold text-white"
                style={{ background: r.color }}
                dir="ltr"
              >
                {r.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-brand-ink/50">{r.from[lang]}</span>
                <span className="flex items-center gap-1 text-[14px] font-semibold leading-snug">
                  <ArrowRight className="size-3.5 shrink-0 text-brand-ink/35 rtl:rotate-180" />
                  <span className="truncate">{r.to[lang]}</span>
                </span>
                {(r.fare || r.every) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-brand-ink/55">
                    {r.fare && <span dir="ltr">{r.fare}</span>}
                    {r.every && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {t.every(r.every)}
                      </span>
                    )}
                    {r.hours && <span dir="ltr">{r.hours}</span>}
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 bg-brand/[0.06] px-3.5 py-2.5 text-[12px] text-brand-ink/60">
            <Bus className="size-3.5 shrink-0" />
            {t.busNote}
          </div>
        </div>
        <div className="mt-2">
          <AppTile app={RTL_APP} />
        </div>
      </DashSection>

      <DashSection title={t.airportTaxi}>
        <div className="overflow-hidden rounded-[22px] bg-white text-brand-ink">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-brand-ink/[0.06] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink/45">
            <span>{t.to}</span>
            <span>{t.car}</span>
            <span>{t.van}</span>
          </div>
          {AIRPORT_TAXI.map((f) => (
            <div key={f.to.en} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-brand-ink/[0.06] px-3.5 py-2.5 text-[14px] last:border-0">
              <span className="font-semibold">{f.to[lang]}</span>
              <span className="font-display font-bold text-brand" dir="ltr">{f.car}</span>
              <span className="font-display font-bold text-brand" dir="ltr">{f.van}</span>
            </div>
          ))}
        </div>
      </DashSection>

      <DashSection title={t.hotlines}>
        <NumberGrid
          items={[
            { id: "taxi", number: "1655", label: t.taxiLine },
            { id: "mtcc", number: "1650", label: t.mtcc },
          ]}
        />
      </DashSection>

      <EmergencyNumbers />
    </div>
  );
}
