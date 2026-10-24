"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { IslandList } from "./island-list";

export type FromSource = "detecting" | "gps" | "manual" | "fallback";

interface Props {
  island: Island | undefined;
  source: FromSource;
  otherId: number | null;
  onSelect: (island: Island) => void;
  onUseLocation: () => void;
}

const R = 14; // radius of the concave corners joining the tab to the panel
const BLUR = 9; // goo strength while the blob is small
const PANEL_RADIUS = 24;

// Underdamped going out (a little overshoot = springy), critically damped back.
// Quick: reaches full size in ~220ms, one small overshoot, settled by ~450ms.
const OPEN_SPRING = { k: 225, c: 18.5 };
const CLOSE_SPRING = { k: 400, c: 40 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 as p goes a→b, with zero slope at both ends. */
const ss = (a: number, b: number, p: number) => {
  const x = clamp01((p - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The user's island as a pill in the top bar. Opening it drips a blob out of
 * the pill that swells and spreads into the panel.
 *
 * Everything is driven by one spring value p (0 closed → 1 open, briefly
 * past 1 when it overshoots); each frame derives the blob's size and
 * roundness, the goo blur, the pill colour and the content fade from p, so
 * there are no steps between states and a tap mid-flight just retargets the
 * spring. Place it as a flex child of a `relative` top bar; the pill takes
 * the free space and the panel spans the bar's full width.
 */
export function LocationPill({ island, source, otherId, onSelect, onUseLocation }: Props) {
  const { t, lang } = useLang();
  const [target, setTarget] = useState<0 | 1>(0);
  const [session, setSession] = useState(0);
  const filterId = `goo-${useId().replace(/:/g, "")}`;

  const pillRef = useRef<HTMLButtonElement>(null);
  const chevronRef = useRef<SVGSVGElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const filletRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const sim = useRef({ x: 0, v: 0, target: 0, raf: 0, last: 0 });

  /** Paint every animated property for spring position p. */
  const paint = useCallback((p: number) => {
    const c = clamp01(p);

    if (backdropRef.current) backdropRef.current.style.opacity = String(c);

    const pill = pillRef.current;
    if (pill) {
      const fill = ss(0, 0.14, p);
      pill.style.backgroundColor = `rgba(255,255,255,${lerp(0.15, 1, fill)})`;
      pill.style.color = `color-mix(in srgb, var(--color-brand) ${Math.round(fill * 100)}%, white)`;
    }
    if (chevronRef.current) chevronRef.current.style.transform = `rotate(${180 * c}deg)`;

    const pillW = pill?.offsetWidth ?? 120;
    const pillX = pill?.offsetLeft ?? 0; // relative to the header, like the panel
    if (tabRef.current) {
      tabRef.current.style.width = `${pillW}px`;
      tabRef.current.style.left = `${pillX}px`;
      const br = 20 * (1 - ss(0.02, 0.3, p));
      tabRef.current.style.borderRadius = `20px 20px ${br}px ${br}px`;
    }

    const area = areaRef.current;
    if (area) area.style.visibility = p <= 0.0005 && sim.current.target === 0 ? "hidden" : "visible";
    const content = contentRef.current;
    const blob = blobRef.current;
    if (area && content && blob) {
      const W = area.offsetWidth;
      const H = content.offsetHeight - 40; // content includes the tab row
      const start = Math.min(56, pillW * 0.5);
      const over = Math.max(0, p - 1); // overshoot past fully open

      // Height leads (the drip), width catches up (the spread).
      const spread = ss(0.16, 0.86, p);
      let w = lerp(start, W, spread);
      // Drips from under the pill, wherever it sits, and centres as it spreads.
      const cx = lerp(pillX + pillW / 2, W / 2, spread);
      let h = H * Math.pow(ss(0, 1, p), 1.3);
      w += W * 0.05 * over;
      h += H * 0.35 * over;
      // Round as a drop while small, panel corners once spread.
      const round = Math.min(w, h) / 2;
      const r = lerp(round, PANEL_RADIUS, ss(0.5, 1, p));
      const top = -14 * (1 - ss(0, 0.3, p)); // starts tucked under the tab

      blob.style.width = `${w}px`;
      blob.style.left = `${cx - w / 2}px`;
      blob.style.height = `${Math.max(0, h)}px`;
      blob.style.top = `${top}px`;
      blob.style.borderRadius = `${r}px`;

      const o = ss(0.55, 0.92, p);
      content.style.opacity = String(o);
      content.style.transform = `translateY(${(1 - o) * 10}px)`;
    }

    // Goo melts the drop into the pill while small, then fades out so the
    // settled panel is crisp; the drawn concave corners take over the neck.
    const blur = BLUR * (1 - ss(0.6, 0.95, p));
    if (blurRef.current) blurRef.current.setAttribute("stdDeviation", blur.toFixed(2));
    const shadow = `drop-shadow(0 18px 30px rgba(5,20,90,${(0.45 * c).toFixed(3)}))`;
    if (layerRef.current) {
      layerRef.current.style.filter = blur > 0.25 ? `url(#${filterId}) ${shadow}` : shadow;
    }
    const f = R * ss(0.6, 0.95, p);
    filletRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.width = el.style.height = `${f}px`;
      el.style[i === 0 ? "left" : "right"] = `${-f}px`;
      el.style.background = `radial-gradient(circle at ${i === 0 ? "0 0" : "100% 0"}, transparent ${Math.max(0, f - 0.5)}px, #fff ${f}px)`;
    });
  }, [filterId]);

  const step = useCallback(
    function tick(now: number) {
      const s = sim.current;
      const dt = Math.min(0.032, (now - (s.last || now)) / 1000) || 1 / 60;
      s.last = now;
      const { k, c } = s.target === 1 ? OPEN_SPRING : CLOSE_SPRING;
      // Two half-steps per frame keep the spring stable on slow frames.
      for (let i = 0; i < 2; i++) {
        const a = -k * (s.x - s.target) - c * s.v;
        s.v += a * (dt / 2);
        s.x += s.v * (dt / 2);
      }
      const done = Math.abs(s.x - s.target) < 0.002 && Math.abs(s.v) < 0.01;
      if (done) s.x = s.target;
      paint(s.x);
      if (done) {
        s.raf = 0;
        s.last = 0;
        // Closed: remount the list (hidden) so the next opening starts fresh
        // and no rendering lands on the animation's first frames.
        if (s.target === 0) setSession((n) => n + 1);
        return;
      }
      s.raf = requestAnimationFrame(tick);
    },
    [paint],
  );

  const go = useCallback(
    (to: 0 | 1) => {
      const s = sim.current;
      s.target = to;
      setTarget(to);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        s.x = to;
        s.v = 0;
        requestAnimationFrame(() => {
          paint(to);
          if (to === 0) setSession((n) => n + 1);
        });
        return;
      }
      if (!s.raf) s.raf = requestAnimationFrame(step);
    },
    [paint, step],
  );

  const open = () => go(1);
  const close = useCallback(() => go(0), [go]);

  useLayoutEffect(() => {
    paint(sim.current.x);
  }, [island, lang, session, paint]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  useEffect(() => {
    if (target !== 1) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [target, close]);

  const label =
    source === "detecting" && !island
      ? t.locating
      : island
        ? lang === "dv"
          ? island.name_dv
          : island.name_en
        : t.whereTo;

  return (
    <>
      {/* Goo: blur, then cut the alpha back to a hard edge so shapes that
          touch melt into each other. Blur strength is animated. */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur ref={blurRef} in="SourceGraphic" stdDeviation={BLUR} />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
      </svg>

      <div
        ref={backdropRef}
        onClick={close}
        className={`fixed inset-0 z-30 bg-[#0b1a66]/60 ${
          target === 1 ? "" : "pointer-events-none"
        }`}
        style={{ opacity: 0 }}
      />

      {/* Takes the space between the logo and the language switch. */}
      <div className="flex min-w-0 flex-1 justify-center">
      <button
        ref={pillRef}
        onClick={target === 1 ? close : open}
        aria-expanded={target === 1}
        aria-haspopup="dialog"
        aria-label={`${t.yourIsland}: ${label}`}
        className="relative z-50 flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-[20px] ps-2 pe-3"
        style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "white" }}
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          <MapPin className={`size-[18px] ${source === "detecting" ? "animate-pulse" : ""}`} />
          {source === "gps" && <span className="absolute -end-0.5 top-0 size-2 rounded-full bg-emerald-400" />}
        </span>
        <span className="min-w-0 truncate text-[14px] font-semibold">{label}</span>
        <ChevronDown ref={chevronRef} className="size-3.5 shrink-0 opacity-70" />
      </button>
      </div>

      {/* Always mounted (hidden while closed) so opening only animates. */}
      <div ref={areaRef} className="absolute inset-x-0 top-0 z-40" style={{ visibility: "hidden" }}>
          {/* The white shape: a tab under the pill plus the growing blob. */}
          <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0">
            <div ref={tabRef} className="absolute top-0 h-10 bg-white">
              {[0, 1].map((i) => (
                <span
                  key={i}
                  ref={(el) => {
                    filletRefs.current[i] = el;
                  }}
                  className="absolute bottom-0"
                />
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 top-10">
              <div ref={blobRef} className="absolute top-0 bg-white" />
            </div>
          </div>

          {/* Content: sizes the panel, fades in as the blob lands. */}
          <div
            ref={contentRef}
            role="dialog"
            aria-label={t.yourIsland}
            className={`relative flex max-h-[calc(68dvh+40px)] flex-col pt-10 text-brand-ink ${
              target === 1 ? "" : "pointer-events-none"
            }`}
            style={{ opacity: 0 }}
          >
            <div className="flex items-center gap-2 px-5 pb-3 pt-4">
              <h2 className="text-base font-bold">{t.yourIsland}</h2>
              {source === "gps" && (
                <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {t.nearYou}
                </span>
              )}
              {source === "fallback" && (
                <span className="rounded-full bg-brand-ink/5 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/50">
                  {t.locationOffShort}
                </span>
              )}
            </div>
            <IslandList
              key={`${session}-${island?.id ?? 0}`}
              selectedId={island?.id ?? null}
              otherId={otherId}
              onSelect={(i) => {
                onSelect(i);
                close();
              }}
              onUseLocation={() => {
                onUseLocation();
                close();
              }}
              className="flex-1"
            />
          </div>
        </div>
    </>
  );
}
