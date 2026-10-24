"use client";

import { ArrowRight, Bus, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useApi, type AirportFare, type BusRoute } from "@/lib/api";
import { DashSection, EmergencyNumbers, PlaceApps } from "./parts";
import { SeaForecast } from "./sea";
import type { Island } from "@/lib/islands";

/** Custom dashboard for Malé City (Malé, Hulhumalé, Villimalé). */
export function MaleDashboard({ island }: { island: Island }) {
  const { t, lang } = useLang();
  const fares = useApi<AirportFare[]>("/airport-taxi-fares");
  const bus = useApi<BusRoute[]>("/bus-routes");
  return (
    <div>
      <SeaForecast island={island} />

      <DashSection title={t.taxi}>
        <PlaceApps place={island.id} category="taxi" layout="grid" />
      </DashSection>

      <DashSection title={t.busRoutes}>
        <div className="overflow-hidden rounded-[22px] bg-white text-brand-ink">
          {bus.status === "loading" && <div className="h-40 animate-pulse bg-brand-ink/[0.04]" />}
          {(bus.status === "ok" ? bus.data : []).map((r) => (
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
                {(r.fare || r.every_min) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-brand-ink/55">
                    {r.fare && <span dir="ltr">{r.fare}</span>}
                    {r.every_min && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {t.every(r.every_min)}
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
          <PlaceApps place={island.id} category="ferry" layout="rows" />
        </div>
      </DashSection>

      <DashSection title={t.airportTaxi}>
        <div className="overflow-hidden rounded-[22px] bg-white text-brand-ink">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-brand-ink/[0.06] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink/45">
            <span>{t.to}</span>
            <span>{t.car}</span>
            <span>{t.van}</span>
          </div>
          {fares.status === "loading" && <div className="h-28 animate-pulse bg-brand-ink/[0.04]" />}
          {(fares.status === "ok" ? fares.data : []).map((f) => (
            <div key={f.to.en} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-brand-ink/[0.06] px-3.5 py-2.5 text-[14px] last:border-0">
              <span className="font-semibold">{f.to[lang]}</span>
              <span className="font-display font-bold text-brand" dir="ltr">{f.car}</span>
              <span className="font-display font-bold text-brand" dir="ltr">{f.van}</span>
            </div>
          ))}
        </div>
      </DashSection>

      <EmergencyNumbers />
    </div>
  );
}
