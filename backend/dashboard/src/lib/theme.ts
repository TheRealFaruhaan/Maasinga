"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
type RGB = [number, number, number];

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Current theme from <html data-theme>. Dark is the default; the server and first render assume dark. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}

const frames = (n: number) => new Promise<void>((done) => {
  const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
  step(n);
});

/**
 * Switch theme smoothly: the page cross-dissolves from the old theme to the new one (View Transitions).
 * Browsers without View Transitions get a short colour cross-fade; reduced motion switches at once.
 */
export function setTheme(t: Theme) {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {}
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();

  if (typeof document.startViewTransition !== "function") {
    root.classList.add("theme-fade");
    apply();
    window.setTimeout(() => root.classList.remove("theme-fade"), 450);
    return;
  }
  // Wait a few frames inside the transition so React and the maps repaint in the new colours
  // before the browser takes the "after" picture.
  document.startViewTransition(async () => {
    apply();
    // Never hold the transition long if frames are throttled.
    await Promise.race([frames(3), new Promise((done) => setTimeout(done, 160))]);
  });
}

/** Colours for deck.gl layers, which cannot read CSS variables. They mirror globals.css. */
export interface MapPalette {
  land: RGB;
  reef: RGB;
  reefLine: RGB;
  accent: RGB;
  accentLight: RGB; // second step of the data hue (dhonis and ferries)
  slow: RGB;
  neutral: RGB; // grey midpoint of diverging scales
  warning: RGB;
  negative: RGB;
  label: RGB;
  halo: RGB; // outline behind map labels and markers
  marker: RGB; // harbour shape and route ends
  tipBg: string;
  tipText: string;
}

export const MAP: Record<Theme, MapPalette> = {
  light: {
    land: [218, 209, 191],
    reef: [244, 248, 250],
    reefLine: [204, 218, 229],
    accent: [22, 119, 201],
    accentLight: [104, 166, 222],
    slow: [150, 158, 166],
    neutral: [195, 201, 207],
    warning: [205, 135, 20],
    negative: [201, 53, 77],
    label: [17, 20, 24],
    halo: [255, 255, 255],
    marker: [17, 20, 24],
    tipBg: "#111418",
    tipText: "#ffffff",
  },
  dark: {
    land: [92, 98, 104],
    reef: [30, 38, 46],
    reefLine: [46, 58, 68],
    accent: [76, 179, 240],
    accentLight: [168, 214, 245],
    slow: [120, 128, 136],
    neutral: [90, 96, 102],
    warning: [229, 169, 59],
    negative: [229, 86, 111],
    label: [255, 255, 255],
    halo: [12, 13, 15],
    marker: [255, 255, 255],
    tipBg: "#23262a",
    tipText: "#ffffff",
  },
};

export function useMapPalette(): MapPalette {
  return MAP[useTheme()];
}

/** Linear colour between stops [value, colour]; values outside the range take the end colour. */
export function ramp(stops: [number, RGB][], v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (v - a) / (b - a);
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t)) as RGB;
    }
  }
  return stops[stops.length - 1][1];
}
