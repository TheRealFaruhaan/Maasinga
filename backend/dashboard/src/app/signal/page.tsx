"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Clock, Grid3x3, Map as MapIcon, MapPin, Navigation, Radio, Route, ShieldAlert, Ship, Users, WifiOff } from "lucide-react";
import { BarList } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Failed, Loading, Pager, Segmented, SortHeader, useSort } from "@/components/ui";
import { fmt, fmt1, useData, type SignalData } from "@/lib/data";
import s from "./signal.module.css";

const SignalMap = dynamic(() => import("./SignalMap"), { ssr: false, loading: () => <Loading height={620} /> });

const LONG = 10; // km from which a dead zone counts as long
const ROWS = 8;
type Key = "near" | "atoll" | "km" | "pct" | "boats";

export default function SignalPage() {
  const signal = useData<SignalData>("signal.json");
  const [focus, setFocus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { sort, toggle } = useSort<Key>("pct");
  const onSort = (k: Key) => {
    toggle(k);
    setPage(0);
  };

  if (signal instanceof Error) return <Failed what="signal data" />;
  const top = signal?.zones[0];
  const current = focus ?? top?.name ?? "country";
  const byKm = [...(signal?.zones ?? [])].sort((a, b) => b.km - a.km);
  const long = byKm.filter((z) => z.km >= LONG).length;

  const rows = [...(signal?.worst ?? [])].sort((a, b) => {
    const k = sort.key;
    const d = k === "near" || k === "atoll" ? a[k].localeCompare(b[k]) : a[k] - b[k];
    return sort.dir === "asc" ? d : -d;
  });
  const shown = rows.slice(page * ROWS, (page + 1) * ROWS);

  return (
    <Dash title="Phone signal" sub="Late GPS positions mark open sea with no phone signal">
      <Kpis>
        <Kpi icon={WifiOff} tone="red" label="Longest dead zone" value={top ? fmt.format(top.km) : "-"} unit="km" sub={top?.name} />
        <Kpi icon={Ship} label="Boats that crossed it" value={top ? fmt.format(top.boats) : "-"} sub="in the longest dead zone" />
        <Kpi icon={Route} tone="red" label="Dead zones 10 km+" value={signal ? fmt.format(long) : "-"} sub={signal ? `of ${fmt.format(signal.zones.length)} dead zones` : undefined} />
        <Kpi
          icon={Grid3x3}
          tone="amber"
          label="Sea cells with weak signal"
          value={signal ? fmt.format(signal.total.deadCells) : "-"}
          sub={signal ? `of ${fmt.format(signal.total.cells)} sea cells` : undefined}
        />
        <Kpi
          icon={Clock}
          label="Positions late, all sea"
          value={signal ? `${fmt1.format(signal.total.latePct)}%` : "-"}
          sub={signal ? `of ${fmt.format(signal.total.pings)} positions` : undefined}
        />
        <Kpi
          icon={Clock}
          tone="red"
          label="Late in worst zone"
          value={top ? `${Math.round(top.latePct)}%` : "-"}
          sub={signal ? `vs ${fmt1.format(signal.total.latePct)}% overall` : undefined}
        />
      </Kpis>

      <Grid>
        <Panel
          span={8}
          flush
          icon={MapIcon}
          title="Late positions at sea"
          actions={
            top && (
              <Segmented<string>
                label="Map area"
                value={current}
                onChange={setFocus}
                options={[
                  { value: top.name, label: "Worst zone" },
                  { value: "country", label: "Whole country" },
                ]}
              />
            )
          }
        >
          <div className={s.map}>{signal ? <SignalMap cells={signal.cells} zones={signal.zones} focus={current} /> : <Loading height={620} />}</div>
        </Panel>

        <div className={s.stack}>
          <Panel title="Dead zones" icon={WifiOff}>
            {signal ? (
              <BarList
                rows={byKm.slice(0, 6).map((z) => ({
                  key: z.name,
                  label: (
                    <button className={s.zoneBtn} aria-pressed={current === z.name} onClick={() => setFocus(z.name)}>
                      {z.name}
                    </button>
                  ),
                  sub: `${fmt.format(z.boats)} boats, ${Math.round(z.latePct)}% late`,
                  value: z.km,
                  tone: "var(--negative)",
                }))}
                format={(v) => `${fmt.format(v)} km`}
              />
            ) : (
              <Loading height={360} />
            )}
          </Panel>
          <Panel title="Who can act" icon={Users}>
            <ul className={s.acts}>
              <li>
                <Radio size={18} />
                <span>
                  <b>Telecom:</b> add coverage on {top?.name ?? "the longest dead zone"}
                </span>
              </li>
              <li>
                <ShieldAlert size={18} />
                <span>
                  <b>Coast Guard:</b> watch boats in dead zones
                </span>
              </li>
              <li>
                <Navigation size={18} />
                <span>
                  <b>Passengers:</b> share the trip plan before a crossing
                </span>
              </li>
            </ul>
          </Panel>
        </div>

        <Panel span={12} title="Sea cells with most late positions" icon={MapPin}>
          {signal ? (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th><SortHeader label="Near island" k="near" sort={sort} onSort={onSort} /></th>
                    <th><SortHeader label="Atoll" k="atoll" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Distance" k="km" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Late" k="pct" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Boats" k="boats" sort={sort} onSort={onSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((w) => (
                    <tr key={`${w.lat},${w.lon}`}>
                      <td>{w.near}</td>
                      <td>{w.atoll}</td>
                      <td className="num">{Math.round(w.km)} km</td>
                      <td className="num">{Math.round(w.pct)}%</td>
                      <td className="num">{fmt.format(w.boats)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={page} pages={Math.ceil(rows.length / ROWS)} total={rows.length} size={ROWS} onPage={setPage} />
            </>
          ) : (
            <Loading height={420} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
