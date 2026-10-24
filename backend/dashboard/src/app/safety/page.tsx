"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Anchor, CalendarDays, Gauge, Map as MapIcon, Moon, Route, Scale, TrendingDown, Waves } from "lucide-react";
import { BarList, Columns } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Failed, Loading, Pager, Segmented, SortHeader, useSort } from "@/components/ui";
import { fmt, REGION_NAME, shortDate, useBoatName, useData, type NetworkData, type SafetyData } from "@/lib/data";
import type { Area } from "./SafetyMap";
import s from "./safety.module.css";

const SafetyMap = dynamic(() => import("./SafetyMap"), { ssr: false, loading: () => <Loading height={620} /> });

const ROWS = 8;
type Key = "id" | "region" | "roughDays" | "maxWave" | "idx";

export default function SafetyPage() {
  const safety = useData<SafetyData>("safety.json");
  const network = useData<NetworkData>("network.json");
  const [area, setArea] = useState<Area>("male");
  const [page, setPage] = useState(0);
  const { sort, toggle } = useSort<Key>("roughDays");
  const boatName = useBoatName();
  const onSort = (k: Key) => {
    toggle(k);
    setPage(0);
  };

  const ok = safety && !(safety instanceof Error) ? safety : null;
  const net = network && !(network instanceof Error) ? network : null;

  const names = useMemo(() => new Map((net?.places ?? []).map((p) => [p.id, p.name])), [net]);
  const name = (id: string) => names.get(id) ?? id.split(".").pop() ?? id;

  if (safety instanceof Error) return <Failed what="safety data" />;

  const calm = ok?.crossingRates.find((r) => !r.rough);
  const rough = ok?.crossingRates.find((r) => r.rough);
  const roughSummary = ok?.summary.find((r) => r.rough);
  const drop = calm && rough ? Math.round((1 - rough.perDay / calm.perDay) * 100) : null;
  const speedRough = ok?.fullSpeed.split.find((r) => r.rough);
  const speedCalm = ok?.fullSpeed.split.find((r) => !r.rough);
  const total = ok ? ok.days.reduce((a, d) => a + d.crossings, 0) : null;
  const roughTotal = ok ? ok.days.reduce((a, d) => a + d.roughCrossings, 0) : null;
  const busiest = [...(ok?.roughRoutes ?? [])].sort((a, b) => b.n - a.n).slice(0, 6);

  const rows = [...(ok?.fullSpeed.boats ?? [])].sort((a, b) => {
    const k = sort.key;
    const d = k === "id" ? boatName(a.id).localeCompare(boatName(b.id)) : k === "region" ? a.region.localeCompare(b.region) : a[k] - b[k];
    return sort.dir === "asc" ? d : -d;
  });
  const shown = rows.slice(page * ROWS, (page + 1) * ROWS);

  return (
    <Dash title="Safety at sea" sub="Rough sea did not stop the boats">
      <Kpis>
        <Kpi
          icon={Scale}
          label="Crossings a day, rough vs calm"
          value={calm && rough ? `${fmt.format(Math.round(rough.perDay))} / ${fmt.format(Math.round(calm.perDay))}` : "-"}
          sub="per region"
        />
        <Kpi icon={TrendingDown} tone="amber" label="Drop on rough days" value={drop !== null ? `${drop}%` : "-"} sub="fewer open-sea crossings" />
        <Kpi
          icon={Gauge}
          tone="amber"
          label="Full speed in rough sea"
          value={speedRough ? `${Math.round(speedRough.pct)}%` : "-"}
          sub={speedCalm ? `of speedboats, ${Math.round(speedCalm.pct)}% when calm` : undefined}
        />
        <Kpi
          icon={Moon}
          tone="amber"
          label="Night crossings, rough sea"
          value={roughSummary ? fmt.format(roughSummary.nightCrossings) : "-"}
          sub={roughSummary ? `on ${roughSummary.days} rough days` : undefined}
        />
        <Kpi icon={Route} label="Open-sea crossings" value={total !== null ? fmt.format(total) : "-"} spark={ok?.days.map((d) => d.crossings)} />
        <Kpi icon={Waves} tone="amber" label="Crossings in rough sea" value={roughTotal !== null ? fmt.format(roughTotal) : "-"} spark={ok?.days.map((d) => d.roughCrossings)} />
      </Kpis>

      <Grid>
        <Panel
          span={8}
          flush
          icon={MapIcon}
          title="Crossings in rough sea"
          actions={
            <Segmented<Area>
              label="Map area"
              value={area}
              onChange={setArea}
              options={[
                { value: "country", label: "Whole country" },
                { value: "male", label: "Male area" },
              ]}
            />
          }
        >
          <div className={s.map}>{ok ? <SafetyMap routes={ok.roughRoutes} name={name} area={area} /> : <Loading height={620} />}</div>
        </Panel>

        <div className={s.stack}>
          <Panel title="Busiest crossings in rough sea" icon={Anchor}>
            {ok ? (
              <BarList
                rows={busiest.map((r) => ({
                  key: `${r.from}|${r.to}`,
                  label: `${name(r.from)} to ${name(r.to)}`,
                  sub: `${r.days} rough days, ${fmt.format(r.night)} at night`,
                  value: r.n,
                  tone: "var(--warning)",
                }))}
                format={(v) => fmt.format(v)}
              />
            ) : (
              <Loading height={300} />
            )}
          </Panel>
          <Panel title="Rough vs calm" icon={Scale}>
            {calm && rough ? (
              <>
                <BarList
                  rows={[
                    { key: "calm", label: "Calm sea", sub: `${fmt.format(calm.regionDays)} region days`, value: calm.perDay },
                    { key: "rough", label: "Rough sea", sub: `${fmt.format(rough.regionDays)} region days`, value: rough.perDay, tone: "var(--warning)" },
                  ]}
                  format={(v) => fmt.format(Math.round(v))}
                />
                <p className={s.note}>Open-sea crossings a day, per region</p>
              </>
            ) : (
              <Loading height={140} />
            )}
          </Panel>
        </div>

        <Panel span={7} title="Crossings per day" icon={CalendarDays}>
          {ok ? (
            <Columns
              data={ok.days.map((d) => ({ x: shortDate(d.d), total: d.crossings, part: d.roughCrossings }))}
              height={420}
              every={3}
              partColor="var(--warning)"
              partLabel="In rough sea"
              restLabel="Calm"
              format={(v) => fmt.format(v)}
              tip={(c) => `${c.x}: ${fmt.format(c.total)} crossings, ${fmt.format(c.part)} in rough sea`}
            />
          ) : (
            <Loading height={420} />
          )}
        </Panel>
        <Panel span={5} title="Speedboats at full speed in rough sea" icon={Gauge}>
          {ok ? (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th><SortHeader label="Boat" k="id" sort={sort} onSort={onSort} /></th>
                    <th><SortHeader label="Region" k="region" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Rough days" k="roughDays" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Max wave" k="maxWave" sort={sort} onSort={onSort} /></th>
                    <th className="num"><SortHeader label="Speed" k="idx" sort={sort} onSort={onSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => (
                    <tr key={b.id}>
                      <td title={b.id} className={s.boatName}>{boatName(b.id)}</td>
                      <td>{REGION_NAME[b.region]}</td>
                      <td className="num">{b.roughDays}</td>
                      <td className="num">{b.maxWave.toFixed(1)} m</td>
                      <td className="num">{Math.round(b.idx * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={page} pages={Math.ceil(rows.length / ROWS)} total={rows.length} size={ROWS} onPage={setPage} />
              <p className={s.note}>Speed is % of normal. Boat names are best guesses (demo).</p>
            </>
          ) : (
            <Loading height={420} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
