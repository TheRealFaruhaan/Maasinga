"use client";

import DeckGL from "@deck.gl/react";
import { MapView, type Layer, type PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { load, type GeoJSON } from "@/lib/data";
import { useMapPalette } from "@/lib/theme";

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export const VIEW_ALL: ViewState = { longitude: 73.25, latitude: 3.3, zoom: 5.6 };
export const VIEW_MALE: ViewState = { longitude: 73.5, latitude: 4.2, zoom: 9 };

interface Props {
  layers: Layer[];
  view: ViewState;
  height?: number | string;
  tooltip?: (info: PickingInfo) => string | null;
  /** Changing this key flies the camera to the new view. */
  viewKey?: string;
}

// The basemap is drawn from OpenStreetMap shapes in /data, so the map works without internet.
function SeaMapInner({ layers, view, height = 520, tooltip, viewKey }: Props) {
  const [base, setBase] = useState<{ land: GeoJSON; reefs: GeoJSON } | null>(null);
  const c = useMapPalette();
  // Every map is a flat top view: pitch and bearing are always 0.
  const [viewState, setViewState] = useState<ViewState & { transitionDuration?: number }>({ ...view, pitch: 0, bearing: 0 });

  useEffect(() => {
    Promise.all([load<GeoJSON>("land.json"), load<GeoJSON>("reefs.json")]).then(([land, reefs]) => setBase({ land, reefs }));
  }, []);

  // Fly only when the caller asks for a new view (state adjusted during render, not in an effect).
  const [lastKey, setLastKey] = useState(viewKey);
  if (viewKey !== lastKey) {
    setLastKey(viewKey);
    setViewState({ ...view, pitch: 0, bearing: 0, transitionDuration: 1200 });
  }

  const baseLayers = useMemo(
    () =>
      base
        ? [
            new GeoJsonLayer({
              id: "reefs",
              data: base.reefs as never,
              filled: true,
              stroked: true,
              getFillColor: c.reef,
              getLineColor: c.reefLine,
              lineWidthMinPixels: 0.6,
            }),
            new GeoJsonLayer({
              id: "land",
              data: base.land as never,
              filled: true,
              stroked: false,
              getFillColor: c.land,
            }),
          ]
        : [],
    [base, c],
  );

  return (
    <div style={{ position: "relative", height, width: "100%", background: "var(--map-sea)", borderRadius: "inherit", overflow: "hidden", animation: "fade-in 0.8s ease-out both" }}>
      <DeckGL
        views={new MapView({ repeat: false })}
        viewState={viewState}
        onViewStateChange={({ viewState: v }) => setViewState(v as ViewState)}
        controller={{ dragRotate: false, touchRotate: false, scrollZoom: { smooth: false, speed: 0.05 } }}
        layers={[...baseLayers, ...layers]}
        onError={(e) => console.warn("Map layer error:", e.message)}
        getTooltip={(info) => {
          const text = tooltip?.(info);
          return text
            ? {
                text,
                style: {
                  background: c.tipBg,
                  color: c.tipText,
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                  fontSize: "14px",
                  lineHeight: "20px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  whiteSpace: "pre",
                },
              }
            : null;
        }}
      />
      <span style={{ position: "absolute", right: 10, bottom: 8, fontSize: 14, color: "var(--faint)", pointerEvents: "none" }}>
        Map: OpenStreetMap contributors
      </span>
    </div>
  );
}

/** Keeps a map failure (for example no WebGL) inside the map box, so the rest of the page still shows. */
class MapBoundary extends Component<{ children: ReactNode; height: number | string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    console.warn("Map could not start:", e.message);
  }
  render() {
    if (this.state.failed)
      return (
        <div style={{ height: this.props.height, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--faint)", fontSize: 15, background: "var(--map-sea)" }}>
          The map could not start in this browser. Reload the page to try again.
        </div>
      );
    return this.props.children;
  }
}

export default function SeaMap(props: Props) {
  return (
    <MapBoundary height={props.height ?? 520}>
      <SeaMapInner {...props} />
    </MapBoundary>
  );
}
