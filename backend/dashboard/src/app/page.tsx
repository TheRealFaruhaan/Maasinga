"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Anchor, Gauge, MapPin, Navigation, Route, Ship, Users, WifiOff } from "lucide-react";
import { BarList, Columns, LineChart } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Loading } from "@/components/ui";
import { fmt, fmt2, minus, REGION_NAME, REGION_ORDER, shortDate, useData, type HarbourData, type NetworkData, type ReplayData, type SafetyData, type SeaData, type SignalData } from "@/lib/data";
import s from "./overview.module.css";

const OverviewMap = dynamic(() => import("./OverviewMap"), { ssr: false, loading: () => <Loading height={520} /> });

function ok<T>(d: T | Error | undefined): T | null {
  return d && !(d instanceof Error) ? d : null;
}

export default function Overview() {
  const sea = ok(useData<SeaData>("sea.json"));
  const safety = ok(useData<SafetyData>("safety.json"));
  const signal = ok(useData<SignalData>("signal.json"));
  const net = ok(useData<NetworkData>("network.json"));
  const harbour = ok(useData<HarbourData>("harbour.json"));
  const replay = ok(useData<ReplayData>("replay-calm.json"));

  const name = new Map((net?.places ?? []).map((p) => [p.id, p.name]));
  const rough = new Set((sea?.days ?? []).filter((d) => d.r.central.rough).map((d) => d.d));
  const under10 = net?.index.filter((r) => r.index < 10).length;
  const zone = signal?.zones[0];
  const named = (id: string) => (name.get(id) ?? "Unnamed site") !== "Unnamed site";
  const topRoutes = [...(net?.routes ?? [])].filter((r) => named(r.from) && named(r.to)).sort((a, b) => b.n - a.n).slice(0, 6);

  return (
    <Dash
      title="Overview"
      sub="Island transport, read from the GPS of 1,776 boats"
      actions={
        <Link href="/travel" className={s.cta}>
          <Navigation size={16} />
          Plan a trip
        </Link>
      }
    >
      <Kpis>
        <Kpi icon={Route} label="Boat trips" value={net ? fmt.format(net.totals.trips) : "-"} spark={net?.daily.filter((d) => d.d.startsWith("2025-08")).map((d) => d.n)} />
        <Kpi icon={Ship} tone="teal" label="Boats with trips" value={net ? fmt.format(net.totals.boats) : "-"} sub="of 1,776 trackers" />
        <Kpi icon={Gauge} tone="blue" label="Slower per metre of wave" value={sea ? `${Math.round(-sea.regions.central.slope * 100)}%` : "-"} spark={sea?.days.map((d) => d.r.central.idx)} />
        <Kpi icon={Anchor} tone="amber" label="Crossings in rough sea" value={safety ? fmt.format(safety.days.reduce((a, d) => a + d.roughCrossings, 0)) : "-"} spark={safety?.days.map((d) => d.roughCrossings)} />
        <Kpi icon={WifiOff} tone="red" label="Longest dead zone" value={zone ? zone.km : "-"} unit="km" sub={zone ? `${zone.boats} boats crossed it` : undefined} />
        <Kpi icon={Users} tone="amber" label="Islands with too few boats" value={under10 ?? "-"} sub="under 10 a week per 1,000" />
      </Kpis>

      <Grid>
        <Panel span={8} flush title={replay ? `Every tracked boat on ${shortDate(replay.day)}` : "Every tracked boat"} icon={MapPin}>
          <div className={s.map}>{replay ? <OverviewMap replay={replay} /> : <Loading height={560} />}</div>
        </Panel>
        <div className={s.stack}>
          <Panel title="Trips per day" icon={Route}>
            {net ? (
              <LineChart
                data={net.daily.filter((d) => d.d.startsWith("2025-08")).map((d) => ({ x: shortDate(d.d), y: d.n, mark: rough.has(d.d) }))}
                seriesLabel="Trips"
                domain={[0, Math.ceil(Math.max(...net.daily.map((d) => d.n)) / 1000) * 1000]}
                format={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
                every={7}
                height={200}
                markLabel="Rough day"
              />
            ) : (
              <Loading height={200} />
            )}
          </Panel>
          <Panel title="Busiest routes" icon={Navigation}>
            <BarList
              rows={topRoutes.map((r) => ({ key: `${r.from}|${r.to}`, label: `${name.get(r.from) ?? r.from} to ${name.get(r.to) ?? r.to}`, value: r.n }))}
              format={(v) => fmt.format(v)}
            />
          </Panel>
        </div>

        <Panel span={4} title="Harbour arrivals by hour" icon={Anchor}>
          {harbour ? (
            <Columns data={harbour.hours.map((v, h) => ({ x: String(h).padStart(2, "0"), total: v, part: v }))} height={200} every={6} tip={(c) => `${c.x}:00, ${c.total} arrivals`} />
          ) : (
            <Loading height={200} />
          )}
        </Panel>
        <Panel span={4} title="Boat speed follows waves" icon={Gauge}>
          {sea ? (
            <BarList
              rows={REGION_ORDER.map((k) => ({ key: k, label: REGION_NAME[k], value: -sea.regions[k].r_daily, sub: `r = ${minus(fmt2.format(sea.regions[k].r_daily))}` }))}
              max={1}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          ) : (
            <Loading height={200} />
          )}
        </Panel>
        <Panel span={4} title="Dead zones" icon={WifiOff}>
          {signal ? (
            <BarList
              rows={signal.zones.slice(0, 5).map((z) => ({ key: z.name, label: z.name, value: z.km, sub: `${z.boats} boats`, tone: "var(--negative)" }))}
              format={(v) => `${v} km`}
            />
          ) : (
            <Loading height={200} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
