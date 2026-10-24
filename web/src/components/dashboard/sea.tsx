"use client";

import { Waves } from "lucide-react";
import { useApi, type Forecast } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { DashSection } from "./parts";

const TONE = {
  calm: "bg-emerald-400/20 text-emerald-100 ring-emerald-300/30",
  choppy: "bg-amber-400/20 text-amber-100 ring-amber-300/30",
  rough: "bg-red-500/25 text-red-100 ring-red-300/30",
} as const;

/** Live sea forecast for the island's region, today and the next 2 days. */
export function SeaForecast({ island }: { island: Island }) {
  const { t } = useLang();
  const f = useApi<Forecast>(`/forecast?place=${encodeURIComponent(island.id)}`);
  if (f.status === "error") return null; // the forecast service can be down (502); not worth a broken box
  return (
    <DashSection title={t.seaTitle}>
      {f.status !== "ok" ? (
        <div className="h-[92px] animate-pulse rounded-[20px] bg-white/10" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {f.data.days.map((d, i) => {
              const date = new Date(`${d.d}T12:00`);
              return (
                <div key={d.d} className={`rounded-[18px] px-2 py-3 text-center ring-1 ${TONE[d.rating]}`}>
                  <div className="text-[11px] font-semibold opacity-80">{i === 0 ? t.today : t.days[date.getDay()]}</div>
                  <div className="mt-1 flex items-center justify-center gap-1 font-display text-xl font-extrabold text-white" dir="ltr">
                    <Waves className="size-4 opacity-80" />
                    {d.wave.toFixed(1)} m
                  </div>
                  <div className="mt-0.5 text-[12px] font-bold">{t.seaRating[d.rating]}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[11px] text-white/50">{t.seaNote(f.data.name)}</p>
        </>
      )}
    </DashSection>
  );
}
