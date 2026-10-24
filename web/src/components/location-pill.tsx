"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getAtoll, type Island } from "@/lib/islands";
import { IslandList } from "./island-list";

export type FromSource = "detecting" | "gps" | "manual" | "fallback";

interface Props {
  island: Island | undefined;
  /** Large-card title and subtitle (e.g. "Malé City"); default: island name / atoll. */
  title?: string;
  subtitle?: string;
  source: FromSource;
  otherId: string | null;
  onSelect: (island: Island) => void;
  onUseLocation: () => void;
}

const R = 14; // radius of the concave corners joining the tab to the panel
const BLUR = 9; // goo strength while the blob is small
const PANEL_RADIUS = 24;

// Geometry of the two states, relative to the top bar.
const BAR_H = 60; // sticky top bar height
const PILL_Y = 10;
const PILL_H = 40;
const HERO_Y = BAR_H; // the large card sits right under the bar
export const HERO_H = 132;
const SCROLL_RANGE = 110; // px of scroll over which the card becomes the pill

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
export function LocationPill({ island, title, subtitle, source, otherId, onSelect, onUseLocation }: Props) {
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

  // Scroll morph: the large island card at the top of the page and the pill
  // in the bar are this one element. m = max(scroll progress, forced) where
  // "forced" collapses it to the pill when the panel opens from the card.
  const morph = useRef({ scroll: 0, forced: 0, alpha: 0.12, tween: 0 });
  const slotRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const barBgRef = useRef<HTMLDivElement>(null);
  const heroBitsRef = useRef<(HTMLElement | null)[]>([]);
  const titleRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const pinRef = useRef<HTMLSpanElement>(null);

  const paintMorph = useCallback(() => {
    const box = pillRef.current;
    const bar = box?.offsetParent as HTMLElement | null;
    const slot = slotRef.current;
    if (!box || !bar || !slot) return;
    const m = clamp01(Math.max(morph.current.scroll, morph.current.forced));
    const e = m * m * (3 - 2 * m);

    // Pill: label width + pin + chevron + padding, within the free slot.
    const pillW = Math.min(slot.offsetWidth, (measureRef.current?.offsetWidth ?? 60) + 64);
    const pillX = slot.offsetLeft + (slot.offsetWidth - pillW) / 2;
    const heroW = bar.offsetWidth;

    const w = lerp(heroW, pillW, e);
    box.style.left = `${lerp(0, pillX, e)}px`;
    box.style.top = `${lerp(HERO_Y, PILL_Y, e)}px`;
    box.style.width = `${w}px`;
    box.style.height = `${lerp(HERO_H, PILL_H, e)}px`;
    box.style.borderRadius = `${lerp(26, 20, e)}px`;
    morph.current.alpha = lerp(0.12, 0.15, e);
    box.style.boxShadow = `inset 0 0 0 1px rgba(255,255,255,${(0.15 * (1 - e)).toFixed(3)})`;

    // Card-only details fade out early; pill details fade in late.
    const out = 1 - ss(0, 0.45, m);
    heroBitsRef.current.forEach((el) => {
      if (!el) return;
      el.style.opacity = String(out * Number(el.dataset.base ?? 1));
      el.style.transform = `translateY(${-12 * e}px) scale(${lerp(1, 0.85, e)})`;
    });
    const inn = ss(0.5, 0.95, m);
    if (pinRef.current) pinRef.current.style.opacity = String(inn);
    if (chevronRef.current) chevronRef.current.style.opacity = String(0.7 * inn);

    // The name travels from the card's title spot to the pill's label spot.
    const start = lerp(20, 34, e);
    const pos = (el: HTMLElement | null, size: number, opacity: number) => {
      if (!el) return;
      el.style.insetInlineStart = `${start}px`;
      el.style.top = `${lerp(64, PILL_H / 2 - size * 0.62, e)}px`;
      el.style.fontSize = `${size}px`;
      el.style.maxWidth = `${Math.max(0, w - start - lerp(20, 28, e))}px`;
      el.style.opacity = String(opacity);
    };
    const size = lerp(26, 14, e);
    const same = titleRef.current?.textContent === labelRef.current?.textContent;
    const cross = ss(0.35, 0.7, m);
    pos(titleRef.current, size, same ? 1 : 1 - cross);
    pos(labelRef.current, size, same ? 0 : cross);

    // The bar gets its own background once content scrolls under it.
    if (barBgRef.current) barBgRef.current.style.opacity = String(ss(0.4, 1, morph.current.scroll));
  }, []);

  /** Paint every animated property for spring position p. */
  const paint = useCallback((p: number) => {
    const c = clamp01(p);
    paintMorph();

    if (backdropRef.current) backdropRef.current.style.opacity = String(c);

    const pill = pillRef.current;
    if (pill) {
      const fill = ss(0, 0.14, p);
      pill.style.backgroundColor = `rgba(255,255,255,${lerp(morph.current.alpha, 1, fill)})`;
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
  }, [filterId, paintMorph]);

  /** Ease the forced collapse to `to`, then call `done`. */
  const tweenForced = useCallback(
    (to: 0 | 1, done?: () => void) => {
      const m = morph.current;
      cancelAnimationFrame(m.tween);
      const from = m.forced;
      if (from === to) return done?.();
      const t0 = performance.now();
      const dur = 200 + 120 * Math.abs(to - from);
      const frame = (now: number) => {
        const k = clamp01((now - t0) / dur);
        m.forced = lerp(from, to, 1 - Math.pow(1 - k, 3));
        paint(sim.current.x);
        if (k < 1) m.tween = requestAnimationFrame(frame);
        else done?.();
      };
      m.tween = requestAnimationFrame(frame);
    },
    [paint],
  );

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
        if (s.target === 0) {
          setSession((n) => n + 1);
          tweenForced(0); // back to the large card if we're at the top
        }
        return;
      }
      s.raf = requestAnimationFrame(tick);
    },
    [paint, tweenForced],
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

  // Collapse to the pill first when opening from the large card.
  const open = () => {
    const m = Math.max(morph.current.scroll, morph.current.forced);
    if (m >= 0.99) return go(1);
    sim.current.target = 1;
    setTarget(1);
    tweenForced(1, () => go(1));
  };
  const close = useCallback(() => go(0), [go]);

  useLayoutEffect(() => {
    paint(sim.current.x);
  }, [island, lang, session, paint]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        morph.current.scroll = clamp01(window.scrollY / SCROLL_RANGE);
        paint(sim.current.x);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    if (pillRef.current?.offsetParent) ro.observe(pillRef.current.offsetParent);
    return () => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [paint]);

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

  const atoll = island ? getAtoll(island.atoll) : undefined;
  const heroTitle = title ?? (island ? (lang === "dv" ? island.name_dv : island.name_en) : label);
  const heroSub = subtitle ?? (atoll ? (lang === "dv" ? atoll.name_dv : `${atoll.name_en} Atoll`) : "");

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

      {/* Empty flex slot between the logo and the language switch: where
          the pill sits once collapsed. */}
      <div ref={slotRef} className="min-w-0 flex-1 self-stretch" />
      <span ref={measureRef} aria-hidden className="pointer-events-none invisible absolute whitespace-nowrap text-[14px] font-semibold">
        {label}
      </span>

      {/* Bar background, fades in once content scrolls under it. */}
      <div
        ref={barBgRef}
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 bottom-0 top-[calc(-1*env(safe-area-inset-top))] -z-10 bg-brand shadow-[0_8px_24px_-12px_rgba(5,20,90,0.6)]"
        style={{ opacity: 0 }}
      />

      <button
        ref={pillRef}
        onClick={target === 1 ? close : open}
        aria-expanded={target === 1}
        aria-haspopup="dialog"
        aria-label={`${t.yourIsland}: ${label}`}
        className="absolute z-50 overflow-hidden text-start"
        style={{ left: 0, top: HERO_Y, width: "100%", height: HERO_H, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.12)", color: "white" }}
      >
        {/* Large-card details */}
        <span
          ref={(el) => {
            heroBitsRef.current[0] = el;
          }}
          data-base="0.25"
          className="absolute start-5 top-4 origin-top-left font-display text-[44px] font-extrabold leading-none opacity-25 rtl:origin-top-right"
        >
          <span dir="ltr">{island?.code ?? ""}</span>
        </span>
        <span
          ref={(el) => {
            heroBitsRef.current[1] = el;
          }}
          className="absolute end-5 top-4 font-thaana text-[34px] leading-none text-white/15"
        >
          {island ? (lang === "dv" ? island.name_en : island.name_dv) : ""}
        </span>
        <span
          ref={(el) => {
            heroBitsRef.current[2] = el;
          }}
          className="absolute start-5 top-[100px] max-w-[calc(100%-40px)] truncate text-sm text-white/65"
        >
          {heroSub}
        </span>

        {/* The name: card title and pill label, crossfading on the same path. */}
        <span ref={titleRef} className="absolute truncate whitespace-nowrap font-bold leading-tight">
          {heroTitle}
        </span>
        <span ref={labelRef} className="absolute truncate whitespace-nowrap font-semibold leading-tight" style={{ opacity: 0 }}>
          {label}
        </span>

        {/* Pill details */}
        <span ref={pinRef} className="absolute start-2 top-2 grid size-6 place-items-center" style={{ opacity: 0 }}>
          <MapPin className={`size-[18px] ${source === "detecting" ? "animate-pulse" : ""}`} />
          {source === "gps" && <span className="absolute -end-0.5 top-0 size-2 rounded-full bg-emerald-400" />}
        </span>
        <ChevronDown ref={chevronRef} className="absolute end-3 top-[13px] size-3.5" style={{ opacity: 0 }} />
      </button>

      {/* Always mounted (hidden while closed) so opening only animates. */}
      <div ref={areaRef} className="absolute inset-x-0 top-[10px] z-40" style={{ visibility: "hidden" }}>
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
