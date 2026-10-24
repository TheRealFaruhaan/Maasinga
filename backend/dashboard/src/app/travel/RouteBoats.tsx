"use client";

import { useState } from "react";
import { Pager, SortHeader, useSort } from "@/components/ui";
import { shortDate, useBoatName } from "@/lib/data";
import BoatIcon from "../harbour/BoatIcon";
import { stay, TYPE } from "../harbour/harbour";
import s from "./route-boats.module.css";

/** One boat on one route: coded ID, type, trips on the route, typical trip minutes, last day seen. */
export type RouteBoat = [string, "fast" | "dhoni" | "slow", number, number, string];

type Key = "id" | "type" | "trips" | "mins" | "last";
const ROWS = 8;

export default function RouteBoats({ boats }: { boats: RouteBoat[] }) {
  const [page, setPage] = useState(0);
  const { sort, toggle } = useSort<Key>("trips");
  const boatName = useBoatName();
  const total = boats.reduce((a, b) => a + b[2], 0);
  const max = Math.max(...boats.map((b) => b[2]), 1);

  const col: Record<Key, (b: RouteBoat) => string | number> = { id: (b) => boatName(b[0]), type: (b) => b[1], trips: (b) => b[2], mins: (b) => b[3], last: (b) => b[4] };
  const rows = [...boats].sort((x, y) => {
    const a = col[sort.key](x);
    const b = col[sort.key](y);
    const d = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return sort.dir === "asc" ? d : -d;
  });
  const shown = rows.slice(page * ROWS, (page + 1) * ROWS);
  const onSort = (k: Key) => {
    toggle(k);
    setPage(0);
  };

  return (
    <>
      <table className={s.table}>
        <thead>
          <tr>
            <th><SortHeader label="Boat" k="id" sort={sort} onSort={onSort} /></th>
            <th><SortHeader label="Type" k="type" sort={sort} onSort={onSort} /></th>
            <th><SortHeader label="Trips on this route" k="trips" sort={sort} onSort={onSort} /></th>
            <th className="num"><SortHeader label="Typical crossing" k="mins" sort={sort} onSort={onSort} /></th>
            <th className="num"><SortHeader label="Last seen" k="last" sort={sort} onSort={onSort} /></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((b) => (
            <tr key={b[0]} data-type={b[1]}>
              <td>
                <span className={s.boat}>
                  <span className={s.disc}>
                    <BoatIcon type={b[1]} size={20} />
                  </span>
                  <b title={b[0]}>{boatName(b[0])}</b>
                </span>
              </td>
              <td className={s.type}>{TYPE[b[1]]}</td>
              <td>
                <span className={s.trips}>
                  <span className="num">{b[2]}</span>
                  <i className={s.track}>
                    <i className={s.fill} style={{ width: `${Math.max(3, (b[2] / max) * 100)}%` }} />
                  </i>
                  <span className={`${s.share} num`}>{Math.round((b[2] / total) * 100)}%</span>
                </span>
              </td>
              <td className="num">{stay(b[3])}</td>
              <td className="num">{shortDate(b[4])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} pages={Math.ceil(rows.length / ROWS)} total={rows.length} size={ROWS} onPage={setPage} />
    </>
  );
}
