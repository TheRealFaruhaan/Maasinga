"use client";

import { GridCellLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { useEffect, useMemo, useRef, useState } from "react";
import SeaMap, { type ViewState } from "@/components/SeaMap";
import { Scrubber } from "@/components/ui";
import { fmt2, type ReplayData, type SeaData } from "@/lib/data";
import { ramp, useMapPalette, type MapPalette } from "@/lib/theme";
import s from "./sea.module.css";

const DAY_START = 300; // 05:00
const DAY_END = 1440;
const MIN_PER_SEC = 24; // one day in about 47 seconds

const VIEWS: Record<string, ViewState> = {
  country: { longitude: 73.2, latitude: 3.2, zoom: 6.0 },
  male: { longitude: 73.47, latitude: 4.12, zoom: 8.6 },
};

/** Sea Pace Index colour: data blue at normal speed, grey just under, warning to red when boats slow. */
export function paceColor(c: MapPalette, idx: number): [number, number, number, number] {
  return [
    ...ramp(
      [
        [0.8, c.negative],
        [0.9, c.warning],
        [0.97, c.neutral],
        [1.03, c.accent],
      ],
      idx,
    ),
    230,
  ];
}

function clock(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function SeaStateMap({ mode, replay, sea, day }: { mode: "calm" | "rough" | "pace"; replay?: ReplayData; sea: SeaData; day: string }) {
  const [time, setTime] = useState(DAY_START + 120);
  const [playing, setPlaying] = useState(true);
  const [area, setArea] = useState<"country" | "male">(mode === "pace" ? "country" : "male");
  const raf = useRef<number>(0);
  const c = useMapPalette();
  // Boat classes share the one data hue in two steps; slow boats stay grey.
  const classColor = [c.accent, c.accentLight, c.slow];

  const trips = useMemo(() => {
    if (!replay) return [];
    return replay.segments.map((sg) => {
      const path: [number, number][] = [];
      for (let i = 0; i < sg.p.length; i += 2) path.push([sg.p[i] / 10000, sg.p[i + 1] / 10000]);
      return { path, t: sg.t, c: sg.c };
    });
  }, [replay]);

  // Animation clock: advances only while playing and only in replay modes.
  useEffect(() => {
    if (mode === "pace" || !playing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => (t + dt * MIN_PER_SEC > DAY_END ? DAY_START : t + dt * MIN_PER_SEC));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [mode, playing]);

  const cells = sea.cells[day] ?? [];
  const layers =
    mode === "pace"
      ? [
          new GridCellLayer({
            id: "pace",
            data: cells,
            cellSize: 11000,
            extruded: false,
            pickable: true,
            getPosition: (c: [number, number, number, number]) => [c[0] - 0.05, c[1] - 0.05],
            getFillColor: (d: [number, number, number, number]) => paceColor(c, d[2]),
            updateTriggers: { getFillColor: [day, c] },
            transitions: { getFillColor: 400 },
          }),
        ]
      : [
          new TripsLayer({
            id: `trips-${mode}`,
            data: trips,
            getPath: (d: (typeof trips)[number]) => d.path,
            getTimestamps: (d: (typeof trips)[number]) => d.t,
            getColor: (d: (typeof trips)[number]) => classColor[d.c],
            updateTriggers: { getColor: c },
            widthMinPixels: 1.6,
            capRounded: true,
            jointRounded: true,
            fadeTrail: true,
            trailLength: 40,
            currentTime: time,
          }),
        ];

  return (
    <div className={s.mapWrap}>
      <SeaMap
        layers={layers}
        view={VIEWS[area]}
        viewKey={area}
        height="100%"
        tooltip={(info) => {
          if (mode !== "pace" || !info.object) return null;
          const o = info.object as [number, number, number, number];
          const pct = Math.round((o[2] - 1) * 100);
          return `Speedboats at ${fmt2.format(o[2])} of normal speed\n${pct === 0 ? "Normal" : pct > 0 ? `${pct}% faster` : `${-pct}% slower`} · ${o[3]} boats`;
        }}
      />
      <div className={s.overlayTop}>
        <div className={s.areaSwitch} role="group" aria-label="Map area">
          {(["country", "male"] as const).map((a) => (
            <button key={a} className={s.areaBtn} aria-pressed={area === a} onClick={() => setArea(a)}>
              {a === "country" ? "Whole country" : "Male area"}
            </button>
          ))}
        </div>
      </div>
      {mode === "pace" ? (
        <div className={s.overlayBottom}>
          <div className={s.paceLegend}>
            <span>Slower</span>
            <span className={s.paceRamp} />
            <span>Normal speed</span>
          </div>
        </div>
      ) : (
        <div className={s.overlayBottom}>
          <button className={s.play} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              {playing ? <path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor" /> : <path d="M3 1.5l9 5.5-9 5.5z" fill="currentColor" />}
            </svg>
          </button>
          <span className={`${s.clock} num`}>{clock(time)}</span>
          <Scrubber value={Math.round(time)} min={DAY_START} max={DAY_END} onChange={setTime} label="Time of day" />
          <div className={s.classLegend}>
            <span><i style={{ background: "var(--accent)" }} />Speedboat</span>
            <span><i style={{ background: `rgb(${c.accentLight.join(",")})` }} />Dhoni or ferry</span>
            <span><i style={{ background: `rgb(${c.slow.join(",")})` }} />Slow boat</span>
          </div>
        </div>
      )}
    </div>
  );
}
