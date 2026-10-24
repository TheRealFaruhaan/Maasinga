"use client";

import { useMemo, useSyncExternalStore } from "react";
import { MapPin, Ship } from "lucide-react";
import { relativeDays, useLang, type Strings } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { boatsServing, type BoatService, type ServiceState } from "@/lib/boats";
import { DashSection } from "./parts";

// One clock for every status list, ticking every 30 s so ETAs and progress
// move. null until hydrated, so server and client render the same thing.
let now = 0;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => now || (now = Date.now()),
    () => null,
  );

const TONE: Record<ServiceState, { bg: string; fg: string; dot: string }> = {
  loading_here: { bg: "bg-amber-500/12", fg: "text-amber-700", dot: "bg-amber-500" },
  docked_here: { bg: "bg-emerald-500/12", fg: "text-emerald-700", dot: "bg-emerald-500" },
  arriving: { bg: "bg-sky-500/15", fg: "text-sky-700", dot: "bg-sky-500 animate-pulse" },
  en_route_here: { bg: "bg-brand/10", fg: "text-brand", dot: "bg-brand" },
  loading_away: { bg: "bg-brand-ink/5", fg: "text-brand-ink/60", dot: "bg-brand-ink/40" },
  away: { bg: "bg-brand-ink/5", fg: "text-brand-ink/50", dot: "bg-brand-ink/30" },
  left: { bg: "bg-brand-ink/5", fg: "text-brand-ink/50", dot: "bg-brand-ink/30" },
};

const pad = (n: number) => String(n).padStart(2, "0");
function minutesAgo(t: Strings, d: Date, nowMs: number) {
  const m = Math.max(1, Math.round((nowMs - +d) / 60_000));
  return t.updatedAgo(m);
}

/** The boats that serve an island, each with where it is now. */
export function BoatStatusList({ island }: { island: Island }) {
  const { t, lang } = useLang();
  const nowMs = useNow();
  const services = useMemo(() => (nowMs ? boatsServing(island, nowMs) : []), [island, nowMs]);
  const name = lang === "dv" ? island.name_dv : island.name_en;

  return (
    <DashSection title={t.boatsServing(name)}>
      {nowMs === null ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-56 animate-pulse rounded-[20px] bg-white/10" />
          <div className="h-56 animate-pulse rounded-[20px] bg-white/10" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {services.map((s) => (
            <StatusCard key={s.boat.id} s={s} nowMs={nowMs} />
          ))}
        </div>
      )}
    </DashSection>
  );
}

const fmtDay = (t: Strings, d: Date) => `${d.getDate()} ${t.months[d.getMonth()]}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Grid card, as in the concept: boat on top, last/next movement, status. */
function StatusCard({ s, nowMs }: { s: BoatService; nowMs: number }) {
  const { t, lang } = useLang();
  const tone = TONE[s.state];
  const otherName = lang === "dv" ? s.other.name_dv : s.other.name_en;
  const sailing = s.state === "en_route_here" || s.state === "arriving" || s.state === "left";
  const col = (label: string, d: Date) => (
    <div className="min-w-0">
      <div className="truncate text-[9px] font-semibold text-brand-ink/40">{label}</div>
      <div className={`font-display font-extrabold leading-tight text-brand ${lang === "dv" ? "text-[15px]" : "text-lg"}`}>
        {fmtDay(t, d)}
      </div>
      <div className="text-[9px] text-brand-ink/40" dir="ltr">
        {fmtTime(d)} · {relativeDays(t, d, new Date(nowMs))}
      </div>
    </div>
  );

  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] bg-white text-brand-ink">
      <div className="relative flex h-[84px] items-center justify-end px-3" style={{ background: s.boat.color }}>
        <span className="absolute start-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-brand text-white">
          <Ship className="size-4" />
        </span>
        <div className="flex min-w-0 max-w-full flex-col items-center justify-center text-center text-white">
          <span className="font-thaana text-[20px] leading-tight" dir="rtl">
            {s.boat.name_dv}
          </span>
          <span className="mt-0.5 max-w-full truncate font-display text-[10px] font-bold uppercase">
            {s.boat.name_en}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 border-b-2 border-brand/80 px-2.5 py-2">
        {col(t.movement[s.prev.kind], s.prev.at)}
        {col(t.movement[s.next.kind], s.next.at)}
      </div>
      <div className="relative min-h-[60px] flex-1 px-2.5 py-2">
        <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.fg}`}>
          <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
          <span className="truncate">{t.serviceState[s.state](otherName)}</span>
        </span>
        {sailing && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-ink/[0.07]">
            <div
              className={`h-full rounded-full ${s.state === "left" ? "bg-brand-ink/25" : "bg-brand"}`}
              style={{ width: `${Math.round(Math.min(1, s.progress ?? 0) * 100)}%` }}
            />
          </div>
        )}
        <div className="mt-1.5 text-[10px] text-brand-ink/40">{minutesAgo(t, s.updatedAt, nowMs)}</div>
        <MapPin className="absolute -bottom-1 end-1 size-10 fill-brand/10 text-brand/15" />
      </div>
    </article>
  );
}
