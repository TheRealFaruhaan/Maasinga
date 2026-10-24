"use client";

import { GridCellLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { useEffect, useMemo, useRef, useState } from "react";
import SeaMap, { type ViewState } from "@/components/SeaMap";
import type { Place } from "@/lib/data";
import { useMapPalette } from "@/lib/theme";

type Cell = [number, number, number, number, number];
const LOOP = 100; // animation units per loop
const COPIES = 4; // boats drawn along the route at once

/** Camera that fits both ends of the route. */
function fitView(path: [number, number][]): ViewState {
  const lons = path.map((p) => p[0]);
  const lats = path.map((p) => p[1]);
  const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats), 0.02);
  const zoom = Math.min(12, Math.max(6.5, Math.log2(360 / span) - 0.9));
  return { longitude: (Math.min(...lons) + Math.max(...lons)) / 2, latitude: (Math.min(...lats) + Math.max(...lats)) / 2, zoom };
}

export default function RouteMap({ from, to, path, deadCells }: { from: Place; to: Place; path: [number, number][]; deadCells: Cell[] }) {
  const [time, setTime] = useState(0);
  const c = useMapPalette();
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = performance.now();
    const tick = (now: number) => {
      setTime((t) => (t + ((now - last) / 1000) * 22) % LOOP);
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const key = `${from.id}|${to.id}`;
  const view = useMemo(() => fitView(path), [path]);

  // Several copies of the route, offset in time, so boats keep flowing along it.
  const trips = useMemo(() => {
    const n = path.length;
    // Offsets repeat one loop earlier too, so the flow wraps without a gap.
    return Array.from({ length: COPIES * 2 }, (_, j) => {
      const offset = ((j - COPIES) * LOOP) / COPIES;
      return { path, t: path.map((_, i) => offset + (i / Math.max(1, n - 1)) * (LOOP / 2)) };
    });
  }, [path]);

  const layers = [
    new GridCellLayer({
      id: "dead",
      data: deadCells,
      cellSize: 5560,
      extruded: false,
      getPosition: (c: Cell) => [c[0] - 0.025, c[1] - 0.025],
      getFillColor: [...c.negative, 70],
      pickable: true,
    }),
    new PathLayer({
      id: "route-line",
      data: [{ path }],
      getPath: (d: { path: [number, number][] }) => d.path,
      getColor: [...c.accent, 80],
      widthMinPixels: 2,
      jointRounded: true,
    }),
    new TripsLayer({
      id: "route-boats",
      data: trips,
      getPath: (d: (typeof trips)[number]) => d.path,
      getTimestamps: (d: (typeof trips)[number]) => d.t,
      getColor: c.accent,
      widthMinPixels: 3.5,
      capRounded: true,
      jointRounded: true,
      trailLength: 9,
      currentTime: time,
      updateTriggers: { getTimestamps: key },
    }),
    new ScatterplotLayer({
      id: "ends",
      data: [from, to],
      getPosition: (p: Place) => [p.lon, p.lat],
      getRadius: 6,
      radiusUnits: "pixels",
      getFillColor: c.marker,
      getLineColor: c.halo,
      lineWidthMinPixels: 3,
      stroked: true,
    }),
    new TextLayer({
      id: "labels",
      data: [from, to],
      getPosition: (p: Place) => [p.lon, p.lat],
      getText: (p: Place) => p.name,
      getSize: 14,
      getColor: c.label,
      getPixelOffset: [0, -18],
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 600,
      outlineWidth: 4,
      outlineColor: c.halo,
      fontSettings: { sdf: true },
    }),
  ];

  return (
    <SeaMap
      layers={layers}
      view={view}
      viewKey={key}
      height="100%"
      tooltip={(info) => (info.layer?.id === "dead" && info.object ? `No mobile signal here\n${(info.object as Cell)[2]}% of positions arrived late` : null)}
    />
  );
}
