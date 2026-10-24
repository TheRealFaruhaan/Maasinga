"use client";

import { useMemo, useState } from "react";
import { Pager, SortHeader, useSort } from "@/components/ui";
import { useBoatName, type HarbourBoat, type HarbourData } from "@/lib/data";
import BoatIcon from "./BoatIcon";
import { stay, TYPE } from "./harbour";
import s from "./boats.module.css";

export type Filter = "all" | HarbourBoat["type"];
const ROWS = 10;
type Key = "id" | "stays" | "tripsIn" | "days" | "medianMin" | "longestMin" | "hours" | "from";
const AUGUST = Array.from({ length: 31 }, (_, i) => i + 1);

/** Rich sortable list of harbour boats, 10 per page. */
export default function BoatTable({ data, filter }: { data: HarbourData; filter: Filter }) {
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState(filter);
  if (seen !== filter) {
    // a new filter starts again on the first page
    setSeen(filter);
    setPage(0);
  }
  const { sort, toggle } = useSort<Key>("stays");
  const boatName = useBoatName();

  const names = useMemo(() => new Map(data.origins.map((o) => [o.id, o.name])), [data]);

  const fromName = (b: HarbourBoat) => (b.origins[0] ? names.get(b.origins[0][0]) ?? "" : "");
  const rows = data.boats
    .filter((b) => filter === "all" || b.type === filter)
    .sort((a, b) => {
      const k = sort.key;
      const d = k === "id" ? boatName(a.id).localeCompare(boatName(b.id)) : k === "from" ? fromName(a).localeCompare(fromName(b)) : a[k] - b[k];
      return sort.dir === "asc" ? d : -d;
    });
  const pages = Math.ceil(rows.length / ROWS);
  const shown = rows.slice(page * ROWS, (page + 1) * ROWS);
  const onSort = (k: Key) => {
    toggle(k);
    setPage(0);
  };
  const maxHours = Math.max(...shown.map((b) => b.hours), 1);

  return (
    <>
      {/* The rows keep their full width; on narrow screens the list scrolls sideways inside its panel. */}
      <div className={s.scroll}>
      <div className={`${s.row} ${s.head}`}>
        <SortHeader label="Boat" k="id" sort={sort} onSort={onSort} />
        <SortHeader label="Visits" k="stays" sort={sort} onSort={onSort} align="right" />
        <SortHeader label="Arrivals" k="tripsIn" sort={sort} onSort={onSort} align="right" />
        <span className={s.cal}>
          <SortHeader label="Days in harbour" k="days" sort={sort} onSort={onSort} />
          <span className={s.calScale}>1 to 31 Aug</span>
        </span>
        <SortHeader label="Typical" k="medianMin" sort={sort} onSort={onSort} align="right" />
        <SortHeader label="Longest" k="longestMin" sort={sort} onSort={onSort} align="right" />
        <SortHeader label="Total inside" k="hours" sort={sort} onSort={onSort} />
        <SortHeader label="From" k="from" sort={sort} onSort={onSort} />
      </div>
      <ul className={s.list}>
        {shown.map((b) => {
          const on = new Set(b.dayList);
          const from = b.origins[0] ? names.get(b.origins[0][0]) : undefined;
          return (
            <li key={b.id} className={s.row} data-type={b.type}>
              <span className={s.boat}>
                <span className={s.disc}>
                  <BoatIcon type={b.type} />
                </span>
                <span>
                  <span className={s.id} title={b.id}>{boatName(b.id)}</span>
                  <span className={s.type}>{TYPE[b.type]}</span>
                </span>
              </span>
              <span className={`${s.r} ${s.big} num`}>{b.stays}</span>
              <span className={`${s.r} num ${b.tripsIn ? "" : s.dim}`}>{b.tripsIn}</span>
              <span className={s.days} aria-label={`${b.days} days in the harbour`}>
                {AUGUST.map((d) => (
                  <i key={d} className={on.has(d) ? s.dayOn : s.dayOff} title={`${d} Aug${on.has(d) ? ": in the harbour" : ""}`} />
                ))}
              </span>
              <span className={`${s.r} num`}>{stay(b.medianMin)}</span>
              <span className={`${s.r} num`}>{stay(b.longestMin)}</span>
              <span className={s.total}>
                <span className="num">{stay(b.hours * 60)}</span>
                <i className={s.track}>
                  <i className={s.fill} style={{ width: `${Math.max(3, (b.hours / maxHours) * 100)}%` }} />
                </i>
              </span>
              <span className={`${s.from} ${from ? "" : s.dim}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M8 14.5s4.5-4.2 4.5-7.7A4.5 4.5 0 0 0 3.5 6.8c0 3.5 4.5 7.7 4.5 7.7z" />
                  <circle cx="8" cy="6.8" r="1.6" />
                </svg>
                {from ?? "Inside Male"}
              </span>
            </li>
          );
        })}
      </ul>
      </div>
      <Pager page={page} pages={pages} total={rows.length} size={ROWS} onPage={setPage} />
    </>
  );
}
