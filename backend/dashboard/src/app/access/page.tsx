"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Anchor, ArrowDownWideNarrow, Award, Gauge, List, Map as MapIcon, MapPin, Route, Ship, TriangleAlert, Users } from "lucide-react";
import { BarList } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Failed, Loading, Pager, Picker, SortHeader, useSort } from "@/components/ui";
import { fmt, fmt1, useData, type IndexRow, type NetworkData } from "@/lib/data";
import type { IslandDot } from "./AccessMap";
import s from "./access.module.css";

const AccessMap = dynamic(() => import("./AccessMap"), { ssr: false, loading: () => <Loading height={620} /> });

const LOW = 10;
const BIG = 1000; // residents that make an island count in the fewest-boats list
const BAR_MAX = 80; // index that fills the table bar, same top as the map ramp
const ROWS = 10;
type Key = "island" | "atoll" | "pop" | "depWeek" | "boats" | "dests" | "index";

function median(xs: number[]) {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export default function AccessPage() {
  const net = useData<NetworkData>("network.json");
  const [picked, setPicked] = useState("");
  const [page, setPage] = useState(0);
  const { sort, toggle } = useSort<Key>("index", "asc");

  const ok = net && !(net instanceof Error) ? net : null;

  const view = useMemo(() => {
    if (!ok) return null;
    const rows = ok.index;
    const low = rows.filter((r) => r.index < LOW);
    const places = new Map(ok.places.filter((p) => p.kind === "island").map((p) => [p.id, p]));
    const dots: IslandDot[] = rows.flatMap((r) => {
      const p = places.get(r.code);
      return p ? [{ code: r.code, island: r.island, atoll: r.atoll, pop: r.pop, depWeek: r.depWeek, index: r.index, lon: p.lon, lat: p.lat }] : [];
    });
    const options = [...rows]
      .sort((a, b) => a.atoll.localeCompare(b.atoll) || a.island.localeCompare(b.island))
      .map((r) => ({ value: r.code, label: r.island, group: r.atoll }));
    const mid = median(rows.map((r) => r.index));
    const big = rows.filter((r) => r.pop >= BIG).sort((a, b) => a.index - b.index);
    return {
      rows,
      dots,
      options,
      lowCount: low.length,
      lowPop: low.reduce((a, r) => a + r.pop, 0),
      median: mid,
      medianRow: rows.reduce((a, r) => (Math.abs(r.index - mid) < Math.abs(a.index - mid) ? r : a)),
      best: rows.reduce((a, r) => (r.index > a.index ? r : a)),
      big,
    };
  }, [ok]);

  if (net instanceof Error) return <Failed what="island data" />;

  const sel: IndexRow | undefined = view ? (view.rows.find((r) => r.code === picked) ?? view.medianRow) : undefined;
  const worst = view?.big[0];

  const sorted = [...(view?.rows ?? [])].sort((a, b) => {
    const k = sort.key;
    const d = k === "island" || k === "atoll" ? a[k].localeCompare(b[k]) : a[k] - b[k];
    return sort.dir === "asc" ? d : -d;
  });
  const pages = Math.ceil(sorted.length / ROWS);
  const shown = sorted.slice(page * ROWS, (page + 1) * ROWS);
  const onSort = (k: Key) => {
    toggle(k);
    setPage(0);
  };

  return (
    <Dash title="Access" sub="Boat departures a week per 1,000 people, island by island">
      <Kpis>
        <Kpi icon={MapPin} label="Islands measured" value={view ? fmt.format(view.rows.length) : "-"} sub="with people and boats" />
        <Kpi icon={TriangleAlert} tone="amber" label={`Islands under ${LOW}`} value={view ? fmt.format(view.lowCount) : "-"} sub="a week per 1,000 people" />
        <Kpi icon={Users} tone="amber" label="People on those islands" value={view ? fmt.format(view.lowPop) : "-"} sub="residents" />
        <Kpi icon={Gauge} label="Median index" value={view ? fmt1.format(view.median) : "-"} sub="a week per 1,000 people" />
        <Kpi icon={Award} tone="green" label="Best-served island" value={view ? fmt1.format(view.best.index) : "-"} sub={view?.best.island} />
        <Kpi icon={ArrowDownWideNarrow} tone="red" label="Lowest, 1,000+ people" value={worst ? fmt1.format(worst.index) : "-"} sub={worst?.island} />
      </Kpis>

      <Grid>
        <Panel
          span={8}
          flush
          icon={MapIcon}
          title="Boats per 1,000 people"
          actions={view ? <Picker compact label="" placeholder="Find your island" value={picked} onChange={setPicked} options={view.options} /> : undefined}
        >
          <div className={s.map}>{view ? <AccessMap dots={view.dots} picked={picked} flyKey={picked || undefined} onPick={setPicked} /> : <Loading height={620} />}</div>
        </Panel>

        <div className={s.stack}>
          <Panel title="Selected island" icon={MapPin}>
            {sel && view ? (
              <>
                <div className={s.island}>{sel.island}</div>
                <div className={s.atoll}>
                  {sel.atoll}
                  {sel === view.medianRow && !picked ? ", median island" : ""}
                </div>
                <ul className={s.facts}>
                  <li className={s.fact}>
                    <Gauge size={17} />
                    Index
                    <b className="num">{fmt1.format(sel.index)}</b>
                  </li>
                  <li className={s.fact}>
                    <Users size={17} />
                    Residents
                    <b className="num">{fmt.format(sel.pop)}</b>
                  </li>
                  <li className={s.fact}>
                    <Ship size={17} />
                    Departures a week
                    <b className="num">{fmt1.format(sel.depWeek)}</b>
                  </li>
                  <li className={s.fact}>
                    <Route size={17} />
                    Destinations
                    <b className="num">{fmt.format(sel.dests)}</b>
                  </li>
                  <li className={s.fact}>
                    <Anchor size={17} />
                    Boats
                    <b className="num">{fmt.format(sel.boats)}</b>
                  </li>
                </ul>
              </>
            ) : (
              <Loading height={260} />
            )}
          </Panel>
          <Panel title="Fewest boats" icon={TriangleAlert}>
            {view ? (
              <>
                <BarList
                  rows={view.big.slice(0, 6).map((r) => ({ key: r.code, label: r.island, sub: r.atoll, value: r.index, tone: "var(--warning)" }))}
                  format={(v) => fmt1.format(v)}
                />
                <p className={s.note}>Islands of 1,000+ people</p>
              </>
            ) : (
              <Loading height={240} />
            )}
          </Panel>
        </div>

        <Panel span={12} title="All islands" icon={List}>
          {view ? (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th><SortHeader label="Island" k="island" sort={sort} onSort={onSort} /></th>
                    <th><SortHeader label="Atoll" k="atoll" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Residents" k="pop" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Trips a week" k="depWeek" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Boats" k="boats" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Places" k="dests" sort={sort} onSort={onSort} /></th>
                    <th className={s.idxCell}><SortHeader label="Index" k="index" sort={sort} onSort={onSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.code}>
                      <td className={s.name}>{r.island}</td>
                      <td className={s.dim}>{r.atoll}</td>
                      <td className="num">{fmt.format(r.pop)}</td>
                      <td className="num">{fmt1.format(r.depWeek)}</td>
                      <td className="num">{fmt.format(r.boats)}</td>
                      <td className="num">{fmt.format(r.dests)}</td>
                      <td className={s.idxCell}>
                        <span className={s.idx}>
                          <span className="num">{fmt1.format(r.index)}</span>
                          <i className={s.track}>
                            <i
                              className={s.fill}
                              style={{ width: `${Math.min(1, r.index / BAR_MAX) * 100}%`, background: r.index < LOW ? "var(--warning)" : "var(--accent)" }}
                            />
                          </i>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={page} pages={pages} total={sorted.length} size={ROWS} onPage={setPage} />
            </>
          ) : (
            <Loading height={560} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
