"use client";

import { scaleLinear } from "d3-scale";
import { useState, type PointerEvent } from "react";
import { Tip, useWidth } from "@/components/charts";
import { Loading } from "@/components/ui";
import { fmt, useData, type HarbourTimeline } from "@/lib/data";
import { stay } from "./harbour";
import s from "./timeline.module.css";

// Every trip of one boat as distance from Male: the line is the boat's distance every 30 minutes, the thick
// baseline is time in the Male area, thick bars up the chart are calls at islands, hatching is no GPS, and
// after the last day of data a dashed line projects the next trip from the boat's usual cycle.

const H = 340;
const PAD = { top: 30, right: 20, bottom: 34, left: 52 };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Local Maldives times are read as UTC, so the clock on screen is the clock in the data.
const ms = (t: string) => Date.parse(`${t}:00Z`);
const day = (t: number) => {
  const d = new Date(t);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const clock = (t: number) => {
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export default function BoatTimeline({ code }: { code: string }) {
  const tl = useData<HarbourTimeline>(`/harbour/boats/${code}/timeline`);
  if (tl instanceof Error) return <p className={s.empty}>Could not load this boat.</p>;
  if (!tl) return <Loading height={H + 60} />;
  return <Timeline tl={tl} />;
}

/** Drawn only once the data is in, so the chart box exists when its width is measured. */
function Timeline({ tl }: { tl: HarbourTimeline }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const t0 = ms(tl.t0);
  const step = tl.step_min * 60_000;
  const end = t0 + tl.km.length * step;
  const p = tl.projection;
  const projEnd = p ? Math.min(ms(p.back) + 12 * 3600_000, end + 10 * 86400_000) : end;
  const x = scaleLinear().domain([t0, Math.max(end, projEnd)]).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]);
  const top = Math.max(10, ...tl.km.map((k) => k ?? 0));
  const y = scaleLinear().domain([0, top]).nice(4).range([H - PAD.bottom, PAD.top]);
  const ticks = y.ticks(4);

  // The distance line, broken where there is no GPS.
  let path = "";
  tl.km.forEach((k, i) => {
    if (k === null) return;
    const cmd = i > 0 && tl.km[i - 1] !== null ? "L" : "M";
    path += `${cmd}${x(t0 + i * step).toFixed(1)},${y(k).toFixed(1)}`;
  });

  // Runs of missing GPS, drawn hatched.
  const gaps: [number, number][] = [];
  tl.km.forEach((k, i) => {
    if (k !== null) return;
    const last = gaps[gaps.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else gaps.push([i, i + 1]);
  });

  // Day ticks: every 7 days from 1 Aug, plus the end of data.
  const dayTicks = Array.from({ length: Math.floor((Math.max(end, projEnd) - t0) / 86400_000 / 7) + 1 }, (_, i) => t0 + i * 7 * 86400_000);

  // The three trips that went furthest get the name of their furthest island.
  const labelled = [...tl.trips].filter((t) => t.furthest).sort((a, b) => (b.furthest_km ?? 0) - (a.furthest_km ?? 0)).slice(0, 3);
  const furthestStop = (t: HarbourTimeline["trips"][number]) =>
    tl.stops.find((st) => st.place === t.furthest && ms(st.arr) >= ms(t.left) && ms(st.dep) <= ms(t.back));

  // Projected next trip: out to the boat's usual furthest distance and back.
  const usualKm = (() => {
    const ks = tl.trips.map((t) => t.furthest_km ?? 0).filter((k) => k > 0).sort((a, b) => a - b);
    return ks.length ? ks[Math.floor(ks.length / 2)] : 0;
  })();
  const leave = p ? (p.leaves ? ms(p.leaves) : end) : 0;
  const back = p ? ms(p.back) : 0;
  const rampMs = usualKm ? Math.min((back - leave) / 3, 3 * 3600_000) : 0;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round((x.invert(e.clientX - r.left) - t0) / step);
    setHover(i >= 0 && i < tl.km.length ? i : null);
  };
  const hoverT = hover === null ? 0 : t0 + hover * step;
  const hoverStop = hover === null ? undefined : tl.stops.find((st) => ms(st.arr) <= hoverT && ms(st.dep) >= hoverT);

  const awayH = tl.trips.reduce((a, t) => a + t.hours, 0);

  return (
    <div className={s.wrap}>
      <div className={s.facts}>
        <Fact label="Trips out of Male" value={fmt.format(tl.trips.length)} />
        <Fact label="Typical trip" value={p ? stay(p.median_trip_h * 60) : tl.trips.length ? stay(tl.trips[0].hours * 60) : "-"} />
        <Fact label="Typical time in Male" value={p ? stay(p.median_stay_in_male_h * 60) : "-"} />
        <Fact label="Away in August" value={stay(awayH * 60)} />
        <Fact
          label="Next trip (projected)"
          value={p?.today ? `${day(ms(p.today.leaves))} ${clock(ms(p.today.leaves))}` : "Not enough trips"}
          sub={p?.today ? `back ${day(ms(p.today.back))}, from the August cycle` : undefined}
          accent
        />
      </div>

      <div ref={ref} className={s.chart}>
        {width > 0 && (
          <svg width={width} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
            aria-label={`${tl.name ?? tl.code}: distance from Male in August 2025, ${tl.trips.length} trips`}>
            <defs>
              <pattern id="nogps" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
              </pattern>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? s.base : s.grid} />
                {t > 0 && (
                  <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={s.tick}>
                    {fmt.format(t)}
                  </text>
                )}
              </g>
            ))}
            <text x={PAD.left - 8} y={PAD.top - 14} textAnchor="end" className={s.tick}>km</text>
            <text x={PAD.left - 8} y={y(0)} dy="0.32em" textAnchor="end" className={s.maleLabel}>Male</text>

            {gaps.map(([a, b]) => (
              <rect key={a} x={x(t0 + a * step)} y={PAD.top} width={Math.max(1, x(t0 + b * step) - x(t0 + a * step))} height={y(0) - PAD.top} fill="url(#nogps)" className={s.gap} />
            ))}

            <path d={path} className={s.line} />

            {tl.stops.map((st, i) =>
              st.male ? (
                <line key={i} x1={x(ms(st.arr))} x2={Math.max(x(ms(st.arr)) + 2, x(ms(st.dep)))} y1={y(0)} y2={y(0)} className={s.male} />
              ) : (
                <g key={i}>
                  <line x1={x(ms(st.arr))} x2={Math.max(x(ms(st.arr)) + 2, x(ms(st.dep)))} y1={y(st.km)} y2={y(st.km)} className={s.call} />
                  <circle cx={x(ms(st.arr))} cy={y(st.km)} r={3} className={s.callDot} />
                </g>
              ),
            )}

            {labelled.map((t) => {
              const st = furthestStop(t);
              if (!st) return null;
              return (
                <text key={t.left} x={x((ms(st.arr) + ms(st.dep)) / 2)} y={y(st.km) - 10} textAnchor="middle" className={s.place}>
                  {st.name ?? tl.places[t.furthest!]?.name}
                </text>
              );
            })}

            <line x1={x(end)} x2={x(end)} y1={PAD.top - 18} y2={y(0)} className={s.endLine} />
            <text x={x(end) - 6} y={PAD.top - 8} textAnchor="end" className={s.endLabel}>end of data</text>

            {p && usualKm > 0 && (
              <g>
                <rect x={x(end)} y={PAD.top} width={Math.max(0, x(projEnd) - x(end))} height={y(0) - PAD.top} className={s.projZone} />
                <path
                  d={`M${x(end)},${y(0)} L${x(leave)},${y(0)} L${x(leave + rampMs)},${y(usualKm)} L${x(back - rampMs)},${y(usualKm)} L${x(back)},${y(0)}`}
                  className={s.proj}
                />
                <circle cx={x(leave)} cy={y(0)} r={4.5} className={s.projDot} />
                <circle cx={x(back)} cy={y(0)} r={4.5} className={s.projDot} />
                <text x={x(end) + 6} y={PAD.top - 8} className={s.projLabel}>projected</text>
                <text x={x(leave)} y={y(0) - 10} textAnchor="end" className={s.projText}>leaves ~{day(leave)}</text>
                <text x={x(back)} y={y(usualKm) - 8} textAnchor="end" className={s.projText}>back ~{day(back)}</text>
              </g>
            )}

            {dayTicks.map((t) => (
              <text key={t} x={x(t)} y={H - 10} textAnchor="middle" className={s.tick}>
                {day(t).slice(4)}
              </text>
            ))}

            {hover !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={y(0)} className={s.cursor} />}
          </svg>
        )}
        {hover !== null && (
          <Tip x={x(hoverT)} y={PAD.top + 10}>
            <b>{day(hoverT)} {clock(hoverT)}</b>
            <br />
            {tl.km[hover] === null ? "No GPS" : `${fmt.format(tl.km[hover]!)} km from Male`}
            {hoverStop && (
              <>
                <br />
                {hoverStop.male ? (hoverStop.harbour ? "In North Harbour" : `In the Male area${hoverStop.name ? `, ${hoverStop.name}` : ""}`) : `At ${hoverStop.name ?? "an unnamed spot"}`}
              </>
            )}
          </Tip>
        )}
      </div>

      <div className={s.legend}>
        <span><i className={s.lgLine} />Distance from Male</span>
        <span><i className={s.lgMale} />Time in the Male area</span>
        <span><i className={s.lgCall} />Call at an island</span>
        <span><i className={s.lgGap} />No GPS</span>
        {p && <span><i className={s.lgProj} />Projected next trip</span>}
      </div>
    </div>
  );
}

function Fact({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <b className={`${s.factValue} ${accent ? s.accent : ""} num`}>{value}</b>
      {sub && <span className={s.factSub}>{sub}</span>}
    </div>
  );
}
