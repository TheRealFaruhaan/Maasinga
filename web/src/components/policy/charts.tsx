"use client";

import { useState } from "react";

// Single-series charts in one hue (the brand blue): thin bars with rounded
// data ends on a recessive baseline, a hover tooltip per bar, labels in ink.
const BAR = "#3a57e8";
const BAR_HOVER = "#1f3fd6";

/** Vertical bars, e.g. trips per day or arrivals per hour. */
export function BarChart({
  data,
  height = 160,
  format = (v) => v.toLocaleString(),
  tickEvery = 1,
}: {
  data: { label: string; value: number; title?: string }[];
  height?: number;
  format?: (v: number) => string;
  /** Show every Nth x label. */
  tickEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = hover != null ? data[hover] : null;
  return (
    <div className="relative">
      <div className="mb-1 h-5 text-[12px] text-[#0b1a66]/60" aria-live="polite">
        {h ? (
          <>
            <span className="font-semibold text-[#0b1a66]">{format(h.value)}</span> · {h.title ?? h.label}
          </>
        ) : (
          <span>Peak {format(max)}</span>
        )}
      </div>
      <div className="flex items-end gap-[2px] border-b border-[#0b1a66]/15" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.label + i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.title ?? d.label}: ${format(d.value)}`}
            className="flex h-full flex-1 items-end"
          >
            <span
              className="block w-full rounded-t-[4px] transition-colors"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: hover === i ? BAR_HOVER : BAR }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-[#0b1a66]/45">
        {data.map((d, i) => (
          <span key={d.label + i} className="flex-1 text-center">
            {i % tickEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A horizontal bar inside a table cell, 0 to `max`. */
export function InlineBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 w-full rounded-full bg-[#0b1a66]/[0.06]">
      <span className="block h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: BAR }} />
    </span>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[20px] bg-white p-4 ring-1 ring-[#0b1a66]/[0.06]">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[#0b1a66]/50">{label}</div>
      <div className="mt-1 font-display text-[28px] font-extrabold leading-tight">{value}</div>
      {note && <div className="mt-0.5 text-[12px] text-[#0b1a66]/55">{note}</div>}
    </div>
  );
}

export function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[24px] bg-white p-5 ring-1 ring-[#0b1a66]/[0.06] ${className ?? ""}`}>
      <h2 className="text-[16px] font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-[13px] leading-snug text-[#0b1a66]/55">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
