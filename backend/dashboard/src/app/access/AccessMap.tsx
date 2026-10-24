"use client";

import { ScatterplotLayer } from "@deck.gl/layers";
import SeaMap, { type ViewState } from "@/components/SeaMap";
import { fmt, fmt1 } from "@/lib/data";
import { useMapPalette, type MapPalette } from "@/lib/theme";
import s from "./access.module.css";

export interface IslandDot {
  code: string;
  island: string;
  atoll: string;
  pop: number;
  depWeek: number;
  index: number;
  lon: number;
  lat: number;
}

const LOW = 10; // same threshold as the page finding
const VIEW_COUNTRY: ViewState = { longitude: 73.2, latitude: 3.2, zoom: 6.35 };

/** Islands under the threshold in warning; the rest in the data hue, more opaque with a higher index. */
function dotColor(c: MapPalette, d: IslandDot): [number, number, number, number] {
  if (d.index < LOW) return [...c.warning, 235];
  const t = Math.min(1, (d.index - LOW) / (80 - LOW));
  return [...c.accent, Math.round(90 + t * 165)];
}

function radius(pop: number) {
  // sqrt of population, 1.5 km for the smallest island up to 6 km for Male
  return 1500 + Math.min(1, Math.sqrt(pop) / Math.sqrt(137238)) * 4500;
}

export default function AccessMap({ dots, picked, flyKey, onPick }: { dots: IslandDot[]; picked: string; flyKey?: string; onPick: (code: string) => void }) {
  const focus = dots.find((d) => d.code === picked);
  const c = useMapPalette();
  const view = flyKey && focus ? { longitude: focus.lon, latitude: focus.lat, zoom: 9 } : VIEW_COUNTRY;

  const layers = [
    new ScatterplotLayer<IslandDot>({
      id: "islands",
      data: dots,
      pickable: true,
      stroked: true,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => radius(d.pop),
      radiusMinPixels: 5,
      getFillColor: (d) => dotColor(c, d),
      getLineColor: (d) => (d.code === picked ? [...c.marker, 255] : [0, 0, 0, 0]),
      lineWidthMinPixels: 1.5,
      updateTriggers: { getLineColor: [picked, c], getFillColor: c },
      onClick: (info) => info.object && onPick(info.object.code),
    }),
  ];

  return (
    <div className={s.mapWrap}>
      <SeaMap
        layers={layers}
        view={view}
        viewKey={flyKey}
        height="100%"
        tooltip={(info) => {
          if (!info.object) return null;
          const d = info.object as IslandDot;
          return `${d.island} (${d.atoll})\nIndex ${fmt1.format(d.index)} per 1,000 a week\n${fmt1.format(d.depWeek)} departures a week, ${fmt.format(d.pop)} residents`;
        }}
      />
      <div className={s.overlayBottom}>
        <span className={s.legendItem}>
          <i style={{ background: "var(--warning)" }} />
          Under {LOW}
        </span>
        <span className={s.legendItem}>
          <span className="num">{LOW}</span>
          <span className={s.ramp} />
          <span className="num">80+</span>
        </span>
        <span className={s.legendItem}>Circle size: residents</span>
      </div>
    </div>
  );
}
