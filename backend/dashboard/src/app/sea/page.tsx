"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Activity, CalendarDays, Gauge, Map as MapIcon, Ship, Waves, Wind } from "lucide-react";
import { BarList, Columns, LineChart, Scatter } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Failed, Loading, Picker, Scrubber, Segmented } from "@/components/ui";
import { fmt, fmt1, fmt2, minus, REGION_NAME, REGION_ORDER, shortDate, useData, type RegionKey, type ReplayData, type SeaData } from "@/lib/data";
import s from "./sea.module.css";

const SeaStateMap = dynamic(() => import("./SeaStateMap"), { ssr: false, loading: () => <Loading height={620} /> });

type Mode = "calm" | "rough" | "pace";
type Metric = "wave" | "gust" | "rain";

const METRIC: Record<Metric, { title: string; unit: string; digits: number; tip: string }> = {
  wave: { title: "Highest wave", unit: "m", digits: 2, tip: "waves up to" },
  gust: { title: "Strongest gust", unit: "kn", digits: 0, tip: "gusts up to" },
  rain: { title: "Rain (NASA IMERG)", unit: "mm", digits: 1, tip: "rain" },
};

export default function SeaPage() {
  const seaRaw = useData<SeaData>("sea.json");
  const calm = useData<ReplayData>("replay-calm.json");
  const rough = useData<ReplayData>("replay-rough.json");
  const [mode, setMode] = useState<Mode>("calm");
  const [region, setRegion] = useState<RegionKey>("central");
  const [dayIdx, setDayIdx] = useState(4);
  const [metric, setMetric] = useState<Metric>("wave");

  if (seaRaw instanceof Error) return <Failed what="sea data" />;
  const sea = seaRaw ?? null;
  const c = calm && !(calm instanceof Error) ? calm : null;
  const r = rough && !(rough instanceof Error) ? rough : null;
  const replay = mode === "calm" ? c : mode === "rough" ? r : null;
  const fit = sea?.regions[region];
  const day = sea?.days[dayIdx];
  const m = METRIC[metric];

  return (
    <Dash title="Sea state" sub="Boat speed reads the sea: speedboats slow down as waves rise">
      <Kpis>
        <Kpi icon={Ship} label="Speedboats as sensors" value={sea ? fmt.format(sea.sensors) : "-"} sub="read every 15 seconds" />
        <Kpi icon={Gauge} label="Slower per metre of wave" value={sea ? `${Math.round(-sea.regions.central.slope * 100)}%` : "-"} spark={sea?.days.map((d) => d.r.central.idx)} />
        <Kpi icon={Activity} tone="teal" label="Link with waves, North" value={sea ? minus(fmt2.format(sea.regions.north.r_daily)) : "-"} sub="−1 is a perfect link" />
        <Kpi icon={Activity} tone="teal" label="Link with waves, Male" value={sea ? minus(fmt2.format(sea.regions.central.r_daily)) : "-"} sub={sea ? `${fmt.format(sea.regions.central.hours)} hours compared` : undefined} />
        <Kpi icon={Waves} tone="amber" label="Rough days near Male" value={sea ? sea.days.filter((d) => d.r.central.rough).length : "-"} spark={sea?.days.map((d) => d.r.central.wave)} />
        <Kpi icon={Ship} tone="slate" label="Boats moving, calm vs rough" value={c && r ? `${fmt.format(c.boats)} / ${fmt.format(r.boats)}` : "-"} sub={c && r ? `${shortDate(c.day)} vs ${shortDate(r.day)}` : undefined} />
      </Kpis>

      <Grid>
        <Panel
          span={8}
          flush
          icon={MapIcon}
          title={mode === "pace" ? `Boat speed on ${day ? shortDate(day.d) : ""}` : replay ? `Live replay, ${shortDate(replay.day)}, waves up to ${fmt1.format(replay.wave)} m` : "Live replay"}
          actions={
            <Segmented<Mode>
              label="Map"
              value={mode}
              onChange={setMode}
              options={[
                { value: "calm", label: "Calm day" },
                { value: "rough", label: "Rough day" },
                { value: "pace", label: "Speed by day" },
              ]}
            />
          }
        >
          {mode === "pace" && sea && day && (
            <div className={s.dayBar}>
              <span className={`${s.dayLabel} num`}>{shortDate(day.d)}</span>
              <Scrubber value={dayIdx} min={0} max={sea.days.length - 1} onChange={setDayIdx} label="Day in August 2025" />
            </div>
          )}
          <div className={s.map}>
            {sea && (mode === "pace" || replay) ? (
              <SeaStateMap key={mode} mode={mode} replay={replay ?? undefined} sea={sea} day={day?.d ?? sea.days[0].d} />
            ) : (
              <Loading height={620} />
            )}
          </div>
        </Panel>

        <div className={s.stack}>
          <Panel
            title="Speed against waves"
            icon={Gauge}
            actions={<Picker compact label="" placeholder="Region" value={region} onChange={(v) => setRegion(v as RegionKey)} options={REGION_ORDER.map((k) => ({ value: k, label: REGION_NAME[k] }))} />}
          >
            {sea && fit ? (
              <Scatter
                points={sea.days.map((d) => ({ x: d.r[region].wave, y: d.r[region].idx, label: d.d, flag: d.r[region].rough }))}
                fit={{ slope: fit.slope, intercept: fit.intercept }}
                height={300}
                xDomain={[0.6, 2.4]}
                yDomain={[0.85, 1.1]}
                formatX={(v) => `${v.toFixed(1)} m`}
                formatY={(v) => `${Math.round(v * 100)}%`}
                xLabel="Highest wave"
                yLabel="Speed against normal"
                tip={(p) => (
                  <>
                    {shortDate(p.label)}: waves {fmt2.format(p.x)} m
                    <br />
                    Boats at {Math.round(p.y * 100)}% of normal speed
                  </>
                )}
              />
            ) : (
              <Loading height={300} />
            )}
          </Panel>
          <Panel title="Link by region" icon={Activity}>
            {sea ? (
              <BarList
                rows={REGION_ORDER.map((k) => ({ key: k, label: REGION_NAME[k], value: -sea.regions[k].r_daily, sub: `r = ${minus(fmt2.format(sea.regions[k].r_daily))}`, tone: "var(--type-dhoni)" }))}
                max={1}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            ) : (
              <Loading height={200} />
            )}
          </Panel>
        </div>

        <Panel span={8} title={`Daily speed, ${REGION_NAME[region]}`} icon={CalendarDays}>
          {sea ? (
            <LineChart
              data={sea.days.map((d) => ({ x: shortDate(d.d), y: d.r[region].idx, mark: d.r[region].rough }))}
              domain={[0.9, 1.1]}
              format={(v) => `${Math.round(v * 100)}%`}
              every={4}
              height={240}
              markLabel="Rough day"
              seriesLabel="Speed against normal"
              reference={{ value: 1, label: "Normal speed" }}
              tipFormat={(p) => `${p.x}: ${Math.round((p.y ?? 0) * 100)}% of normal speed`}
            />
          ) : (
            <Loading height={240} />
          )}
        </Panel>
        <Panel
          span={4}
          title={`${m.title}, ${REGION_NAME[region]}`}
          icon={Wind}
          actions={
            <Segmented<Metric>
              label="Weather"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "wave", label: "Waves" },
                { value: "gust", label: "Gusts" },
                { value: "rain", label: "Rain" },
              ]}
            />
          }
        >
          {sea ? (
            <Columns
              key={metric}
              data={sea.days.map((d) => ({ x: shortDate(d.d), total: d.r[region][metric], part: d.r[region].rough ? d.r[region][metric] : 0 }))}
              height={240}
              every={10}
              partColor="var(--warning)"
              partLabel="Rough day"
              restLabel="Other days"
              format={(v) => `${v.toFixed(metric === "gust" ? 0 : 1)} ${m.unit}`}
              tip={(col) => `${col.x}: ${m.tip} ${col.total.toFixed(m.digits)} ${m.unit}`}
            />
          ) : (
            <Loading height={240} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
