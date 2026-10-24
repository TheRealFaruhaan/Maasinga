"use client";

import { ArcLayer } from "@deck.gl/layers";
import SeaMap, { type ViewState } from "@/components/SeaMap";
import { fmt, fmt2, type SafetyData } from "@/lib/data";
import { useMapPalette } from "@/lib/theme";
import s from "./safety.module.css";

type RoughRoute = SafetyData["roughRoutes"][number];

const VIEWS: Record<string, ViewState> = {
  country: { longitude: 73.2, latitude: 3.3, zoom: 6.4 },
  male: { longitude: 73.5, latitude: 4.2, zoom: 9 },
};

export type Area = "country" | "male";

export default function SafetyMap({ routes, name, area }: { routes: RoughRoute[]; name: (id: string) => string; area: Area }) {
  const c = useMapPalette();
  const max = Math.max(...routes.map((r) => r.n), 1);

  const layers = [
    new ArcLayer<RoughRoute>({
      id: "rough-routes",
      data: routes,
      pickable: true,
      getSourcePosition: (r) => r.path[0],
      getTargetPosition: (r) => r.path[1],
      getSourceColor: [...c.warning, 70],
      getTargetColor: [...c.warning, 235],
      updateTriggers: { getSourceColor: c, getTargetColor: c },
      getWidth: (r) => 1 + (r.n / max) * 7,
      widthUnits: "pixels",
      getHeight: 0.4,
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
          if (!info.object) return null;
          const r = info.object as RoughRoute;
          return `${name(r.from)} to ${name(r.to)}\n${fmt.format(r.n)} trips on ${r.days} rough days, ${fmt.format(r.night)} at night\nWaves up to ${fmt2.format(r.maxWave)} m`;
        }}
      />
    </div>
  );
}
