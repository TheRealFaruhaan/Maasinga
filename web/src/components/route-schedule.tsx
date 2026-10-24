"use client";

import { useMemo } from "react";
import { isLaunch, upcomingPredicted, useApi, type Prediction, type RouteDetail, type ViaConnection } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { getIsland, type Island } from "@/lib/islands";
import { boatColor, type FerryKind } from "@/lib/kinds";
import { TripCard } from "./cards";

/**
 * Usual departures between two islands (API /routes/{from}/{to}), laid out
 * from now onwards. Times are August 2025 patterns, not a dated timetable.
 * `kind` filters by boat: launch (fast) or boat (dhoni / slow); null = all.
 */
export function RouteSchedule({ from, to, kind }: { from: Island; to: Island; kind: FerryKind | null }) {
  const { t } = useLang();
  const f = encodeURIComponent(from.id);
  const tt = encodeURIComponent(to.id);
  // Predicted departures for today and tomorrow (August patterns + the live
  // sea forecast), with a probability each.
  const pred = useApi<Prediction>(`/predict/routes/${f}/${tt}?days=2`);

  const items = useMemo(() => {
    if (pred.status !== "ok") return [];
    return upcomingPredicted(pred.data.days)
      .map((d) => ({ ...d, boats: kind === null ? d.boats : d.boats.filter((b) => isLaunch(b.type) === (kind === "launch")) }))
      .filter((d) => d.boats.length > 0)
      .slice(0, 6);
  }, [pred, kind]);

  // Nothing predicted: explain why, from the route itself (and its one-stop
  // connections). Only fetched when needed.
  const route = useApi<RouteDetail>(pred.status === "ok" && items.length === 0 ? `/routes/${f}/${tt}` : null);

  if (pred.status === "loading" || pred.status === "idle") return <Skeleton />;
  if (pred.status === "error") return <Note>{t.loadFailed}</Note>;
  if (items.length === 0) {
    if (route.status === "loading" || route.status === "idle") return <Skeleton />;
    if (route.status === "error") return <Note>{t.loadFailed}</Note>;
    const r = route.data;
    // Real one-stop connections, through inhabited islands only (not resorts
    // or unnamed sites), busiest first.
    const via = r.via
      .filter((v) => getIsland(v.via_id))
      .sort((a, b) => Math.min(b.first_trips, b.second_trips) - Math.min(a.first_trips, a.second_trips))
      .slice(0, 3);
    const msg = !r.listed
      ? r.trips > 0
        ? t.fewTrips(r.trips)
        : t.noDirectRoute
      : r.departures.length
        ? t.noTimesForKind
        : t.noRegularTimes(r.trips, Math.round(r.median_min));
    return (
      <div className="space-y-3">
        <Note>{msg}</Note>
        {via.length > 0 && <ViaList from={from} to={to} via={via} />}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((d) => {
        const b = d.boats[0];
        return (
          <TripCard
            key={`${d.day.date}-${d.departs}`}
            date={d.date}
            time={d.departs}
            arrives={d.arrives}
            from={from}
            to={to}
            boat={{ name: b.name, color: boatColor(b.code) }}
            confidence={d.confidence}
            probability={d.probability}
          />
        );
      })}
      <p className="px-1 text-[11px] leading-snug text-white/55">{t.patternNote}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-[118px] animate-pulse rounded-[22px] bg-white/10" />
      <div className="h-[118px] animate-pulse rounded-[22px] bg-white/10" />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[22px] bg-white/10 px-5 py-6 text-center text-[15px] text-white/75">{children}</p>;
}

/** "Change at X": the first and second leg with typical minutes. */
function ViaList({ from, to, via }: { from: Island; to: Island; via: ViaConnection[] }) {
  const { t, lang } = useLang();
  const nm = (i: Island | undefined, fallback: string) => (i ? (lang === "dv" ? i.name_dv : i.name_en) : fallback);
  return (
    <div className="overflow-hidden rounded-[22px] bg-white text-brand-ink">
      <div className="border-b border-brand-ink/[0.06] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-ink/45">
        {t.oneStop}
      </div>
      {via.map((v) => {
        const mid = getIsland(v.via_id);
        return (
          <div key={v.via_id} className="border-b border-brand-ink/[0.06] px-4 py-3 last:border-0">
            <div className="text-[15px] font-bold">{t.changeAt(nm(mid, v.via_name))}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-brand-ink/60">
              <span>{nm(from, "")}</span>
              <span dir="ltr">→ ~{Math.round(v.first_min)} min →</span>
              <span className="font-semibold text-brand-ink">{nm(mid, v.via_name)}</span>
              <span dir="ltr">→ ~{Math.round(v.second_min)} min →</span>
              <span>{nm(to, "")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
