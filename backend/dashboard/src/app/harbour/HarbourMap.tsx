"use client";

import { ArcLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import SeaMap from "@/components/SeaMap";
import type { HarbourData } from "@/lib/data";
import { useMapPalette } from "@/lib/theme";

type Origin = HarbourData["origins"][number] & { k: number };

const VIEW = { longitude: 73.4, latitude: 4.22, zoom: 8.9 };
const MIN_TRIPS = 3; // origins with fewer trips in the month are left off the map

export default function HarbourMap({ data }: { data: HarbourData }) {
  const c = useMapPalette();
  const lon = data.polygon.reduce((a, p) => a + p[0], 0) / data.polygon.length;
  const lat = data.polygon.reduce((a, p) => a + p[1], 0) / data.polygon.length;
  const origins: Origin[] = data.origins.filter((o) => o.n >= MIN_TRIPS).map((o) => ({ ...o, k: o.n }));
  const max = Math.max(...origins.map((o) => o.k), 1);
  const labels = origins.slice(0, 8);

  const layers = [
    new ArcLayer({
      id: "arcs",
      data: origins,
      getSourcePosition: (o: Origin) => [o.lon, o.lat],
      getTargetPosition: () => [lon, lat],
      getSourceColor: [...c.accent, 60],
      getTargetColor: [...c.accent, 230],
      getWidth: (o: Origin) => 1 + 7 * Math.sqrt(o.k / max),
      getHeight: 0.35,
      pickable: true,
    }),
    new ScatterplotLayer({
      id: "origins",
      data: origins,
      getPosition: (o: Origin) => [o.lon, o.lat],
      getRadius: (o: Origin) => 3 + 6 * Math.sqrt(o.k / max),
      radiusUnits: "pixels",
      getFillColor: c.accent,
      pickable: true,
    }),
    new PolygonLayer({
      id: "harbour",
      data: [{ polygon: data.polygon }],
      getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
      getFillColor: [...c.marker, 230],
      getLineColor: c.marker,
      lineWidthMinPixels: 2,
    }),
    new ScatterplotLayer({
      id: "harbour-dot",
      data: [{ p: [lon, lat] }],
      getPosition: (d: { p: [number, number] }) => d.p,
      getRadius: 7,
      radiusUnits: "pixels",
      getFillColor: c.marker,
      getLineColor: c.halo,
      stroked: true,
      lineWidthMinPixels: 3,
    }),
    new TextLayer({
      id: "labels",
      data: labels,
      getPosition: (o: Origin) => [o.lon, o.lat],
      getText: (o: Origin) => o.name,
      getSize: 14,
      getColor: c.label,
      getPixelOffset: [0, -14],
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 500,
      outlineWidth: 4,
      outlineColor: c.halo,
      fontSettings: { sdf: true },
    }),
  ];

  return (
    <SeaMap
      layers={layers}
      view={VIEW}
      height="100%"
      tooltip={(info) => {
        if (!info.object || (info.layer?.id !== "arcs" && info.layer?.id !== "origins")) return null;
        const o = info.object as Origin;
        return `${o.name}\n${o.k} trips into the harbour`;
      }}
    />
  );
}
