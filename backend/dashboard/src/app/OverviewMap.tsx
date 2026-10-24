"use client";

import { PathLayer } from "@deck.gl/layers";
import { useMemo } from "react";
import SeaMap from "@/components/SeaMap";
import type { ReplayData } from "@/lib/data";
import { useMapPalette } from "@/lib/theme";

const VIEW = { longitude: 73.35, latitude: 3.7, zoom: 6.5 };

/** Every boat path of one day, drawn at once: a density picture of the fleet. */
export default function OverviewMap({ replay }: { replay: ReplayData }) {
  const c = useMapPalette();
  const paths = useMemo(
    () =>
      replay.segments.map((sg) => {
        const path: [number, number][] = [];
        for (let i = 0; i < sg.p.length; i += 2) path.push([sg.p[i] / 10000, sg.p[i + 1] / 10000]);
        return { path, c: sg.c };
      }),
    [replay],
  );
  const color = [c.accent, c.accentLight, c.slow];
  const layers = [
    new PathLayer({
      id: "day",
      data: paths,
      getPath: (d: (typeof paths)[number]) => d.path,
      getColor: (d: (typeof paths)[number]) => [...color[d.c], 120],
      widthMinPixels: 1.2,
      jointRounded: true,
      capRounded: true,
      updateTriggers: { getColor: c },
    }),
  ];
  return <SeaMap layers={layers} view={VIEW} height="100%" />;
}
