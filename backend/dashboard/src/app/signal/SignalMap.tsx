"use client";

import { GridCellLayer } from "@deck.gl/layers";
import SeaMap, { type ViewState } from "@/components/SeaMap";
import { fmt, type SignalData } from "@/lib/data";
import { ramp, useMapPalette, type MapPalette } from "@/lib/theme";
import s from "./signal.module.css";

type Cell = SignalData["cells"][number]; // lon, lat, late %, pings, boats
type Zone = SignalData["zones"][number];
type RGBA = [number, number, number, number];

const HALF = 0.025; // cells are 0.05 degree; GridCellLayer places them by the lower-left corner
const STRONG = 5; // late % from which a cell is drawn at full opacity

const COUNTRY: ViewState = { longitude: 73.2, latitude: 3.0, zoom: 6.0, pitch: 0, bearing: 0 };

/** Grey when positions arrive on time, warning at 25% late, negative at 75% late or more. */
function lateColor(c: MapPalette, pct: number): RGBA {
  const rgb = ramp(
    [
      [0, c.neutral],
      [25, c.warning],
      [75, c.negative],
    ],
    pct,
  );
  return [...rgb, pct >= STRONG ? 235 : 110];
}

export function zoneView(z: Zone, zoom = 6.8): ViewState {
  return { longitude: z.lon, latitude: z.lat, zoom, pitch: 0, bearing: 0 };
}

export default function SignalMap({ cells, zones, focus }: { cells: Cell[]; zones: Zone[]; focus: string }) {
  const c = useMapPalette();
  const zone = zones.find((z) => z.name === focus);
  const view = zone ? zoneView(zone, zone === zones[0] ? 6.8 : 7.6) : COUNTRY;

  const layers = [
    new GridCellLayer<Cell>({
      id: "late",
      data: cells,
      cellSize: 5000,
      extruded: false,
      pickable: true,
      getPosition: (c) => [c[0] - HALF, c[1] - HALF],
      getFillColor: (d) => lateColor(c, d[2]),
      updateTriggers: { getFillColor: c },
      material: false,
    }),
  ];

  return (
    <div className={s.mapWrap}>
      <SeaMap
        layers={layers}
        view={view}
        viewKey={focus}
        height="100%"
        tooltip={(info) => {
          if (!info.object) return null;
          const c = info.object as Cell;
          return `${Math.round(c[2])}% of positions late, ${fmt.format(c[4])} boats`;
        }}
      />
      <div className={s.overlayBottom}>
        <span>On time</span>
        <span className={s.ramp} />
        <span>75%+ late</span>
      </div>
    </div>
  );
}
