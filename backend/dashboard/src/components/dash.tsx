"use client";

import type { LucideIcon } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
import CountUp from "./CountUp";
import s from "./dash.module.css";

export type Tone = "blue" | "teal" | "amber" | "red" | "green" | "slate";

const TONE: Record<Tone, string> = {
  blue: "var(--accent)",
  teal: "var(--type-dhoni)",
  amber: "var(--warning)",
  red: "var(--negative)",
  green: "var(--positive)",
  slate: "var(--faint)",
};

export const tone = (t: Tone) => TONE[t];

/** Page frame for a dashboard: title row with actions, then the content grid. */
export function Dash({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className={s.dash}>
      <header className={s.head}>
        <div>
          <h1 className={s.title}>{title}</h1>
          {sub && <p className={s.sub}>{sub}</p>}
        </div>
        <div className={s.actions}>
          {actions}
          <span className={s.period}>Aug 2025</span>
        </div>
      </header>
      {children}
    </main>
  );
}

/** A row of KPI cards. */
export function Kpis({ children }: { children: ReactNode }) {
  return <div className={s.kpis}>{children}</div>;
}

/** Small area chart for a KPI card, filled with a soft gradient of the card's tone. */
export function Spark({ values, color }: { values: number[]; color: string }) {
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 100;
  const h = 32;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" pathLength={1} />
    </svg>
  );
}

export function Kpi({
  icon: Icon,
  tone: t = "blue",
  label,
  value,
  unit,
  sub,
  spark,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  spark?: number[];
}) {
  return (
    <section className={s.kpi} style={{ "--k": TONE[t] } as CSSProperties}>
      <div className={s.kpiTop}>
        <span className={s.kpiIcon}>
          <Icon size={18} strokeWidth={2} />
        </span>
        <span className={s.kpiLabel}>{label}</span>
      </div>
      <div className={`${s.kpiValue} num`}>
        {typeof value === "string" || typeof value === "number" ? <CountUp value={String(value)} /> : value}
        {unit && <span className={s.kpiUnit}>{unit}</span>}
      </div>
      {spark ? <Spark values={spark} color={TONE[t]} /> : sub ? <div className={s.kpiSub}>{sub}</div> : null}
    </section>
  );
}

/** Twelve-column grid; panels take a span. */
export function Grid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

export function Panel({
  span = 12,
  title,
  icon: Icon,
  actions,
  flush,
  className,
  children,
}: {
  span?: number;
  title: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${s.panel} ${flush ? s.flush : ""} ${className ?? ""}`} style={{ "--span": span } as CSSProperties}>
      <header className={s.panelHead}>
        <h2 className={s.panelTitle}>
          {Icon && <Icon size={17} strokeWidth={2} />}
          {title}
        </h2>
        {actions && <div className={s.panelActions}>{actions}</div>}
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
