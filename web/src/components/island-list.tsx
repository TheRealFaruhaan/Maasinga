"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LocateFixed, Search } from "lucide-react";
import { useIslands, type Island } from "@/lib/islands";
import { useLang } from "@/lib/i18n";

export interface IslandListProps {
  selectedId: string | null;
  /** The island picked on the other side; shown disabled so From ≠ To. */
  otherId: string | null;
  onSelect: (island: Island) => void;
  /** Shows a "use my current location" row first. */
  onUseLocation?: () => void;
  /** Tailwind classes for the scroll area height. */
  className?: string;
}

/**
 * Search + atoll accordion. Mount it fresh each time its container opens
 * (key it) so the search clears and the selected atoll starts expanded.
 */
export function IslandList({ selectedId, otherId, onSelect, onUseLocation, className }: IslandListProps) {
  const { t, lang } = useLang();
  const { islands: ISLANDS, atolls: ATOLLS } = useIslands();
  const byAtoll = useMemo(
    () => ATOLLS.map((atoll) => ({ atoll, islands: ISLANDS.filter((i) => i.atoll === atoll.code) })),
    [ATOLLS, ISLANDS],
  );
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const sel = ISLANDS.find((i) => i.id === selectedId);
    return new Set(sel ? [sel.atoll] : []);
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected]");
    const box = listRef.current;
    if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }, []);

  const raw = q.trim();
  const query = raw.toLowerCase();
  const groups = useMemo(() => {
    if (!query) return byAtoll;
    return byAtoll
      .map(({ atoll, islands }) => {
        const atollHit =
          atoll.name_en.toLowerCase().includes(query) ||
          atoll.code.toLowerCase() === query ||
          atoll.name_dv.includes(raw);
        return {
          atoll,
          islands: atollHit
            ? islands
            : islands.filter(
                (i) =>
                  i.name_en.toLowerCase().includes(query) ||
                  i.name_dv.includes(raw) ||
                  i.code.toLowerCase() === query,
              ),
        };
      })
      .filter((g) => g.islands.length > 0);
  }, [query, raw, byAtoll]);

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full rounded-full border border-brand-ink/10 bg-brand-ink/[0.04] ps-10 pe-4 text-[15px] outline-none placeholder:text-brand-ink/40 focus:border-brand focus:bg-white"
          />
        </div>
      </div>

      <div ref={listRef} className={`relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent_0,#000_12px,#000_calc(100%-28px),transparent_100%)] overflow-y-auto overscroll-contain px-2 pb-3 ${className ?? ""}`}>
        {onUseLocation && !query && (
          <button
            onClick={onUseLocation}
            className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-brand/10 px-4 py-3 text-start font-semibold text-brand"
          >
            <LocateFixed className="size-5" />
            {t.useLocation}
          </button>
        )}

        {groups.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-brand-ink/50">{t.noMatch}</p>
        )}

        {groups.map(({ atoll, islands }) => {
          const isOpen = !!query || expanded.has(atoll.code);
          return (
            <div key={atoll.code} className="border-b border-brand-ink/[0.06] last:border-0">
              <button
                onClick={() => toggle(atoll.code)}
                className="flex w-full items-center gap-3 px-2 py-3 text-start"
                aria-expanded={isOpen}
              >
                <span className="grid h-7 min-w-9 place-items-center rounded-lg bg-brand text-xs font-bold text-white">
                  {atoll.code}
                </span>
                <span className="flex-1 font-semibold">{lang === "dv" ? atoll.name_dv : atoll.name_en}</span>
                <span className="text-xs text-brand-ink/40">{islands.length}</span>
                <ChevronDown
                  className={`size-4 text-brand-ink/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <ul className="pb-2">
                  {islands.map((i) => {
                    const selected = i.id === selectedId;
                    const disabled = i.id === otherId;
                    return (
                      <li key={i.id}>
                        <button
                          disabled={disabled}
                          data-selected={selected || undefined}
                          onClick={() => onSelect(i)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors ${
                            selected ? "bg-brand text-white" : "hover:bg-brand-ink/[0.04]"
                          } ${disabled ? "opacity-35" : ""}`}
                        >
                          <span className="flex-1 truncate font-medium">
                            {lang === "dv" ? i.name_dv : i.name_en}
                          </span>
                          <span
                            className={`font-thaana text-[14px] ${selected ? "text-white/70" : "text-brand-ink/40"}`}
                            dir={lang === "dv" ? "ltr" : "rtl"}
                          >
                            {lang === "dv" ? i.name_en : i.name_dv}
                          </span>
                          {selected && <Check className="size-4" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
