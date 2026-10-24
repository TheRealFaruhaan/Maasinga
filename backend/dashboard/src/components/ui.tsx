"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import { useState, type ReactNode } from "react";
import s from "./ui.module.css";

export function Page({ title, finding, aside, children }: { title: string; finding?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <main className={s.page}>
      <div className={s.titleRow}>
        <div>
          <h1 className={s.title}>{title}</h1>
          {finding && <p className={s.finding}>{finding}</p>}
        </div>
        {aside && <div className={s.aside}>{aside}</div>}
      </div>
      {children}
    </main>
  );
}

export function Card({ title, meta, children, className, flush }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`${s.card} ${flush ? s.flush : ""} ${className ?? ""}`}>
      {(title || meta) && (
        <header className={s.cardHead}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {meta && <div className={s.cardMeta}>{meta}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Grid({ cols, children, className }: { cols: string; children: ReactNode; className?: string }) {
  return (
    <div className={`${s.grid} ${className ?? ""}`} style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  lead?: boolean;
}

/** One container split into equal columns: label above value, unit as a grey suffix. */
export function Stats({ items }: { items: StatItem[] }) {
  return (
    <div className={s.stats} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} data-count={items.length}>
      {items.map((it) => (
        <div key={it.label} className={s.stat}>
          <div className={s.statLabel}>{it.label}</div>
          <div className={`${s.statValue} ${it.lead ? s.statLead : ""} num`}>
            {it.value}
            {it.unit && <span className={s.unit}> {it.unit}</span>}
          </div>
          {it.note && <div className={s.statNote}>{it.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      className={s.seg}
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={s.segItem}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Picker({ value, onChange, options, label, placeholder, compact }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; group?: string }[]; label: string; placeholder?: string; compact?: boolean }) {
  const groups = Array.from(new Set(options.map((o) => o.group ?? "")));
  return (
    <div className={s.picker}>
      {label && <span className={s.pickerLabel}>{label}</span>}
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger className={`${s.selectTrigger} ${compact ? s.compact : ""}`} aria-label={label || placeholder}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon className={s.selectIcon}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={s.selectContent} position="popper" sideOffset={6}>
            <Select.Viewport className={s.selectViewport}>
              {groups.map((g) => (
                <Select.Group key={g}>
                  {g && <Select.Label className={s.selectGroup}>{g}</Select.Label>}
                  {options
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      <Select.Item key={o.value} value={o.value} className={s.selectItem}>
                        <Select.ItemText>{o.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                </Select.Group>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function Scrubber({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return (
    <Slider.Root className={s.slider} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label}>
      <Slider.Track className={s.sliderTrack}>
        <Slider.Range className={s.sliderRange} />
      </Slider.Track>
      <Slider.Thumb className={s.sliderThumb} aria-label={label} />
    </Slider.Root>
  );
}

export function Pill({ tone, children }: { tone: "positive" | "warning" | "negative" | "neutral"; children: ReactNode }) {
  return <span className={`${s.pill} ${s[tone]}`}>{children}</span>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={s.note}>{children}</p>;
}

export function Loading({ height = 200 }: { height?: number }) {
  return <div className={s.loading} style={{ height }} aria-busy="true" />;
}

export function Failed({ what }: { what: string }) {
  return <p className={s.failed}>Could not load {what}. Run the pipeline, then reload.</p>;
}

/** Page through a list: "1-12 of 332", previous, page numbers, next. */
export function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  // First, last and the pages next to the current one; gaps shown as "...".
  const nums = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - page) <= 1);
  return (
    <nav className={s.pager} aria-label="Pages">
      <span className="num">
        {from}-{to} of {total}
      </span>
      <span className={s.pages}>
        <button className={s.pageBtn} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          Previous
        </button>
        {nums.map((n, i) => (
          <span key={n} style={{ display: "contents" }}>
            {i > 0 && n - nums[i - 1] > 1 && <span className={s.gap}>...</span>}
            <button className={`${s.pageBtn} num`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
              {n + 1}
            </button>
          </span>
        ))}
        <button className={s.pageBtn} disabled={page === pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next
        </button>
      </span>
    </nav>
  );
}

export type SortDir = "asc" | "desc";

/** Sort state for a table: clicking the active column flips the direction, a new column starts high to low. */
export function useSort<K extends string>(initial: K, dir: SortDir = "desc") {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initial, dir });
  const toggle = (key: K) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  return { sort, toggle };
}

export function SortHeader<K extends string>({ label, k, sort, onSort, align }: { label: string; k: K; sort: { key: K; dir: SortDir }; onSort: (k: K) => void; align?: "right" }) {
  const active = sort.key === k;
  return (
    <button
      className={s.sortBtn}
      data-active={active}
      onClick={() => onSort(k)}
      style={align === "right" ? { justifySelf: "end" } : undefined}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
        <path d="M5 1L1.5 5h7z" fill="currentColor" opacity={active && sort.dir === "asc" ? 1 : 0.35} />
        <path d="M5 11L1.5 7h7z" fill="currentColor" opacity={active && sort.dir === "desc" ? 1 : 0.35} />
      </svg>
    </button>
  );
}
