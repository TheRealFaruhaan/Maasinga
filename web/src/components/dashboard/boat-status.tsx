"use client";

import { useMemo } from "react";
import { MapPin, Ship } from "lucide-react";
import { upcomingPredicted, useApi, type BoatType, type Confidence, type PlaceDetail, type Prediction } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { boatColor } from "@/lib/kinds";
import { BoatName } from "../cards";
import { DashSection } from "./parts";

interface BoatCardData {
  code: string;
  name: string;
  type: BoatType;
  /** Next predicted departure from this island (today or tomorrow). */
  next?: { time: string; tomorrow: boolean; to: string; arrives: string; confidence: Confidence; probability: number };
  trips?: number;
}

/**
 * Boats that serve an island (API: its predicted departure board and the
 * boats based there). The API has no live positions yet, so cards show each
 * boat's next predicted departure from here instead of where it is now.
 */
export function BoatStatusList({ island }: { island: Island }) {
  const { t, lang } = useLang();
  const id = encodeURIComponent(island.id);
  const schedule = useApi<Prediction>(`/predict/places/${id}?days=2`);
  const place = useApi<PlaceDetail>(`/places/${id}`);

  const boats = useMemo<BoatCardData[]>(() => {
    const out = new Map<string, BoatCardData>();
    if (schedule.status === "ok") {
      const today = new Date().toDateString();
      for (const d of upcomingPredicted(schedule.data.days)) {
        for (const b of d.boats) {
          if (out.has(b.code)) continue;
          out.set(b.code, {
            code: b.code,
            name: b.name,
            type: b.type,
            next: {
              time: d.departs,
              tomorrow: d.date.toDateString() !== today,
              to: d.to_name,
              arrives: d.arrives,
              confidence: d.confidence,
              probability: d.probability,
            },
          });
        }
      }
    }
    if (place.status === "ok") {
      for (const b of place.data.boats_based) {
        const known = out.get(b.code);
        if (known) known.trips = b.trips;
        else out.set(b.code, { code: b.code, name: b.name, type: b.type, trips: b.trips });
      }
    }
    return [...out.values()].slice(0, 8);
  }, [schedule, place]);

  const name = lang === "dv" ? island.name_dv : island.name_en;
  const loading = schedule.status === "loading" || place.status === "loading";

  return (
    <DashSection title={t.boatsServing(name)}>
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-52 animate-pulse rounded-[20px] bg-white/10" />
          <div className="h-52 animate-pulse rounded-[20px] bg-white/10" />
        </div>
      ) : boats.length === 0 && schedule.status === "error" && place.status === "error" ? (
        <p className="rounded-[22px] bg-white/10 px-5 py-6 text-center text-white/70">{t.loadFailed}</p>
      ) : boats.length === 0 ? (
        <p className="rounded-[22px] bg-white/10 px-5 py-6 text-center text-white/70">{t.noBoatData}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {boats.map((b) => (
            <BoatCard key={b.code} b={b} />
          ))}
        </div>
      )}
    </DashSection>
  );
}

function BoatCard({ b }: { b: BoatCardData }) {
  const { t } = useLang();
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] bg-white text-brand-ink">
      <div className="relative flex h-[84px] items-center justify-end overflow-hidden ps-12 pe-3" style={{ background: boatColor(b.code) }}>
        <span className="absolute start-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-brand text-white">
          <Ship className="size-4" />
        </span>
        <BoatName name_en={b.name} size="lg" />
      </div>
      {b.next ? (
        <div className="grid grid-cols-2 gap-1 border-b-2 border-brand/80 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-[9px] font-semibold text-brand-ink/40">{t.nextLikely}</div>
            <div className="font-display text-lg font-extrabold leading-tight text-brand" dir="ltr">
              {b.next.time}
            </div>
            <div className="text-[9px] text-brand-ink/40">{b.next.tomorrow ? t.tomorrow : t.today}</div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[9px] font-semibold text-brand-ink/40">{t.to}</div>
            <div className="truncate font-display text-[15px] font-extrabold leading-tight text-brand">{b.next.to}</div>
            <div className="text-[9px] text-brand-ink/40" dir="ltr">
              ~{b.next.arrives}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-b-2 border-brand/80 px-2.5 py-2">
          <div className="text-[9px] font-semibold text-brand-ink/40">{t.nextLikely}</div>
          <div className="text-[13px] font-semibold text-brand-ink/60">{t.noRegularTime}</div>
        </div>
      )}
      <div className="relative min-h-[52px] flex-1 px-2.5 py-2">
        <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
          {t.boatTypes[b.type]}
        </span>
        <div className="mt-1.5 text-[10px] text-brand-ink/45">
          {b.next ? t.confidence(b.next.confidence, Math.round(b.next.probability * 100)) : b.trips ? t.tripsInAugust(b.trips) : ""}
        </div>
        <MapPin className="absolute -bottom-1 end-1 size-10 fill-brand/10 text-brand/15" />
      </div>
    </article>
  );
}
