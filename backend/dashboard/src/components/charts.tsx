"use client";

import { scaleBand, scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import s from "./charts.module.css";

// Small SVG charts: one series each, 3 to 5 faint gridlines, no y-axis line, ticks in grey,
// round steps with the top tick above the data, a hover readout on every chart.

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** An id that is safe inside url(#...). */
function useGradId() {
  return `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

const PAD = { top: 14, right: 14, bottom: 30, left: 58 };

export function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className={s.tip} style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

function YGrid({ ticks, y, width, format }: { ticks: number[]; y: (v: number) => number; width: number; format: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={PAD.left} x2={width - PAD.right} className={s.grid} />
          <text x={PAD.left - 8} dy="0.32em" textAnchor="end" className={s.tick}>
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

export interface LinePoint {
  x: string;
  y: number | null;
  mark?: boolean;
}

/** One line over categories (days or hours). `marks` are drawn as a second tone behind the line. */
export function LineChart({
  data,
  height = 180,
  domain,
  format = (v) => String(v),
  tipFormat,
  every = 1,
  markLabel,
  seriesLabel = "Index",
  reference,
  color = "var(--accent)",
}: {
  data: LinePoint[];
  height?: number;
  domain: [number, number];
  format?: (v: number) => string;
  tipFormat?: (p: LinePoint) => ReactNode;
  every?: number;
  markLabel?: string;
  seriesLabel?: string;
  reference?: { value: number; label: string };
  color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const x = scaleBand<string>().domain(data.map((d) => d.x)).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]).padding(0);
  const y = scaleLinear().domain(domain).range([height - PAD.bottom, PAD.top]);
  const ticks = y.ticks(4);
  const cx = (d: LinePoint) => (x(d.x) ?? 0) + x.bandwidth() / 2;
  const path = line<LinePoint>()
    .defined((d) => d.y !== null)
    .x(cx)
    .y((d) => y(d.y as number))(data);
  // Soft fill under the line, from the data hue at the line to nothing at the base.
  const fill = area<LinePoint>()
    .defined((d) => d.y !== null)
    .x(cx)
    .y0(height - PAD.bottom)
    .y1((d) => y(d.y as number))(data);
  const gid = useGradId();

  return (
    <div ref={ref} className={s.wrap} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseLeave={() => setHover(null)}>
          {data.map((d) => d.mark && <rect key={`m${d.x}`} x={x(d.x)} width={x.bandwidth()} y={PAD.top} height={height - PAD.top - PAD.bottom} className={s.mark} />)}
          <YGrid ticks={ticks} y={y} width={width} format={format} />
          {reference && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} className={s.reference} />
              <text x={width - PAD.right} y={y(reference.value) - 6} textAnchor="end" className={s.tick}>
                {reference.label}
              </text>
            </g>
          )}
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {/* Keyed by shape, so new data redraws the line instead of jumping. */}
          <path key={`a${fill}`} className={s.area} d={fill ?? ""} fill={`url(#${gid})`} />
          <path key={`l${path}`} className={s.line} d={path ?? ""} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" pathLength={1} />
          {data.map((d, i) =>
            i % every === 0 || i === data.length - 1 ? (
              <text key={`t${d.x}`} x={cx(d)} y={height - 8} textAnchor="middle" className={s.tick}>
                {i % every === 0 ? d.x : ""}
              </text>
            ) : null,
          )}
          {hover !== null && data[hover].y !== null && (
            <g>
              <line x1={cx(data[hover])} x2={cx(data[hover])} y1={PAD.top} y2={height - PAD.bottom} className={s.cursor} />
              <circle cx={cx(data[hover])} cy={y(data[hover].y as number)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
          {data.map((d, i) => (
            <rect key={`h${d.x}`} x={x(d.x)} width={x.bandwidth()} y={0} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hover !== null && data[hover].y !== null && (
        <Tip x={cx(data[hover])} y={y(data[hover].y as number)}>
          {tipFormat ? tipFormat(data[hover]) : `${data[hover].x}: ${format(data[hover].y as number)}`}
        </Tip>
      )}
      {markLabel && (
        <div className={s.legend}>
          <span className={s.legendLine} style={{ background: color }} /> {seriesLabel}
          <span className={s.legendMark} /> {markLabel}
        </div>
      )}
    </div>
  );
}

export interface ScatterPoint {
  x: number;
  y: number;
  label: string;
  flag?: boolean;
}

/** Points with a straight fitted line. Flagged points use the warning tone. */
export function Scatter({
  points,
  fit,
  height = 260,
  xDomain,
  yDomain,
  formatX,
  formatY,
  xLabel,
  yLabel,
  tip,
}: {
  points: ScatterPoint[];
  fit?: { slope: number; intercept: number };
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  xLabel: string;
  yLabel: string;
  tip: (p: ScatterPoint) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { ...PAD, bottom: 40, top: 22 };
  const x = scaleLinear().domain(xDomain).range([pad.left, Math.max(pad.left + 1, width - pad.right)]);
  const y = scaleLinear().domain(yDomain).range([height - pad.bottom, pad.top]);
  return (
    <div ref={ref} className={s.wrap} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <YGrid ticks={y.ticks(4)} y={y} width={width} format={formatY} />
          {x.ticks(5).map((t) => (
            <text key={t} x={x(t)} y={height - pad.bottom + 18} textAnchor="middle" className={s.tick}>
              {formatX(t)}
            </text>
          ))}
          <text x={width - pad.right} y={height - 4} textAnchor="end" className={s.axisLabel}>
            {xLabel}
          </text>
          <text x={pad.left} y={10} className={s.axisLabel}>
            {yLabel}
          </text>
          {fit && (
            <line
              x1={x(xDomain[0])}
              x2={x(xDomain[1])}
              y1={y(fit.intercept + fit.slope * xDomain[0])}
              y2={y(fit.intercept + fit.slope * xDomain[1])}
              className={s.fit}
            />
          )}
          {points.map((p, i) => (
            <circle
              key={`${p.label}${p.x}${p.y}`}
              className={s.dot}
              cx={x(p.x)}
              cy={y(p.y)}
              r={hover === i ? 7 : 5}
              fill={p.flag ? "var(--warning)" : "var(--accent)"}
              stroke="var(--surface)"
              strokeWidth={2}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "r 0.15s", animationDelay: `${i * 18}ms`, transformOrigin: `${x(p.x)}px ${y(p.y)}px` }}
            />
          ))}
        </svg>
      )}
      {hover !== null && (
        <Tip x={x(points[hover].x)} y={y(points[hover].y)}>
          {tip(points[hover])}
        </Tip>
      )}
    </div>
  );
}

export interface Column {
  x: string;
  total: number;
  part: number;
}

/** Columns over categories: the full bar in grey, the part that matters in the data hue on top of its base. */
export function Columns({
  data,
  height = 200,
  format = (v) => String(v),
  every = 1,
  partLabel,
  restLabel,
  partColor = "var(--accent)",
  tip,
}: {
  data: Column[];
  height?: number;
  format?: (v: number) => string;
  every?: number;
  partLabel?: string;
  restLabel?: string;
  partColor?: string;
  tip: (c: Column) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const x = scaleBand<string>().domain(data.map((d) => d.x)).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]).padding(0.2);
  const max = Math.max(...data.map((d) => d.total));
  const y = scaleLinear().domain([0, max]).nice(4).range([height - PAD.bottom, PAD.top]);
  const gid = useGradId();
  return (
    <div ref={ref} className={s.wrap}>
      {partLabel && restLabel && (
        <div className={s.legend} style={{ marginBottom: 8 }}>
          <span className={s.legendSwatch} style={{ background: `linear-gradient(180deg, ${partColor}, color-mix(in srgb, ${partColor} 55%, transparent))` }} /> {partLabel}
          <span className={s.legendSwatch} style={{ background: "var(--bar-rest)" }} /> {restLabel}
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id={`${gid}p`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: partColor, stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: partColor, stopOpacity: 0.55 }} />
            </linearGradient>
            <linearGradient id={`${gid}r`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--bar-rest)", stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: "var(--bar-rest)", stopOpacity: 0.55 }} />
            </linearGradient>
          </defs>
          <YGrid ticks={y.ticks(4)} y={y} width={width} format={format} />
          {data.map((d, i) => {
            const x0 = x(d.x) ?? 0;
            return (
              <g key={`${d.x}${d.total}${d.part}`} className={s.col} style={{ animationDelay: `${i * 16}ms` }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.55}>
                <rect x={x0} width={x.bandwidth()} y={y(d.part)} height={y(0) - y(d.part)} fill={`url(#${gid}p)`} rx={3} />
                <rect x={x0} width={x.bandwidth()} y={y(d.total)} height={Math.max(0, y(d.part) - y(d.total) - 2)} fill={`url(#${gid}r)`} rx={3} />
                <rect x={x0 - 2} width={x.bandwidth() + 4} y={PAD.top} height={height - PAD.top - PAD.bottom} fill="transparent" />
                {i % every === 0 && (
                  <text x={x0 + x.bandwidth() / 2} y={height - 8} textAnchor="middle" className={s.tick}>
                    {d.x}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <Tip x={(x(data[hover].x) ?? 0) + x.bandwidth() / 2} y={y(data[hover].total) + 28}>
          {tip(data[hover])}
        </Tip>
      )}
    </div>
  );
}

/** A sorted list where each row carries a thin bar under its label. */
export function BarList({ rows, max, format }: { rows: { key: string; label: ReactNode; sub?: ReactNode; value: number; tone?: string }[]; max?: number; format: (v: number) => string }) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className={s.barList}>
      {rows.map((r) => (
        <li key={r.key} className={s.barRow}>
          <div className={s.barText}>
            <span className={s.barLabel}>{r.label}</span>
            {r.sub && <span className={s.barSub}>{r.sub}</span>}
          </div>
          <span className={`${s.barValue} num`}>{format(r.value)}</span>
          <div className={s.barTrack}>
            <div key={r.value} className={s.barFill} style={{
                width: `${(r.value / m) * 100}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${r.tone ?? "var(--accent)"} 35%, transparent), ${r.tone ?? "var(--accent)"})`,
              }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
