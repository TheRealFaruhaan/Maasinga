"use client";

import { useEffect, useRef, useState } from "react";

const NUM = /[−-]?\d[\d,]*(?:\.\d+)?/g;

function parse(tok: string) {
  const neg = /^[−-]/.test(tok);
  const clean = tok.replace(/[−,-]/g, "");
  // "09" or "00" (clock times) keep their leading zeros while counting.
  const pad = /^0\d/.test(clean) ? clean.length : 0;
  return { v: (neg ? -1 : 1) * Number(clean), dec: clean.includes(".") ? clean.split(".")[1].length : 0, comma: tok.includes(","), minus: tok.startsWith("−"), pad };
}

function format(v: number, p: ReturnType<typeof parse>) {
  const abs = Math.abs(v);
  const raw = p.comma ? abs.toLocaleString("en-US", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) : abs.toFixed(p.dec);
  const s = p.pad ? raw.padStart(p.pad, "0") : raw;
  return v < 0 || (p.v < 0 && v === 0) ? `${p.minus ? "−" : "-"}${s}` : s;
}

/**
 * Counts every number inside a text ("68,840", "13%", "1,124 / 803") up from its last value
 * (zero on first show). Text without numbers is shown as it is.
 */
export default function CountUp({ value, ms = 900 }: { value: string; ms?: number }) {
  // The frame being shown, tagged with the value it belongs to; other values render as they are.
  const [frame, setFrame] = useState<{ of: string; text: string } | null>(null);
  const prev = useRef<number[] | null>(null);

  useEffect(() => {
    const toks = value.match(NUM);
    if (!toks) return;
    const target = toks.map(parse);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setFrame({ of: value, text: value }));
      prev.current = target.map((p) => p.v);
      return () => cancelAnimationFrame(raf);
    }
    const from = prev.current && prev.current.length === target.length ? prev.current : target.map(() => 0);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3); // ease out
      let i = 0;
      const text = value.replace(NUM, () => {
        const p = target[i];
        const v = from[i] + (p.v - from[i]) * e;
        i++;
        return format(v, p);
      });
      setFrame({ of: value, text });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prev.current = target.map((p) => p.v);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  // Before the first frame: zeros on first show, the last shown text on a change. No flash of the end value.
  const hasNum = /\d/.test(value);
  const shown = !hasNum ? value : frame ? frame.text : value.replace(NUM, (t) => format(0, parse(t)));
  return <>{shown}</>;
}
