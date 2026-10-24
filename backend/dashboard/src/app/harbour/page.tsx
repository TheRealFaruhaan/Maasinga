"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Anchor, CalendarCheck, Clock, List, Map as MapIcon, Route, Ship, Timer } from "lucide-react";
import { Columns } from "@/components/charts";
import { Dash, Grid, Kpi, Kpis, Panel } from "@/components/dash";
import { Failed, Loading, Segmented } from "@/components/ui";
import { fmt, useData, type HarbourBoat, type HarbourData } from "@/lib/data";
import BoatIcon from "./BoatIcon";
import BoatTable, { type Filter } from "./BoatTable";
import { median, stay, TYPE } from "./harbour";
import s from "./harbour.module.css";

const HarbourMap = dynamic(() => import("./HarbourMap"), { ssr: false, loading: () => <Loading height={620} /> });

const REGULAR = 10; // days in August that make a boat a regular
const TYPES: HarbourBoat["type"][] = ["fast", "dhoni", "slow"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
/** Short stay for a KPI: minutes under an hour, whole hours above. */
const short = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.round(m / 60)}h`);

export default function HarbourPage() {
  const raw = useData<HarbourData>("harbour.json");
  const [filter, setFilter] = useState<Filter>("all");

  if (raw instanceof Error) return <Failed what="harbour data" />;
  const data = raw ?? null;
  const boats = data?.boats ?? [];
  const busiest = data ? data.hours.indexOf(Math.max(...data.hours)) : 0;
  const typeMedian = (t: HarbourBoat["type"]) => median(boats.filter((b) => b.type === t).map((b) => b.medianMin));

  return (
    <Dash title="Harbour" sub="Boats that used North Harbour in Male, August 2025">
      <Kpis>
        <Kpi icon={Anchor} label="Boats that stayed" value={data ? fmt.format(boats.length) : "-"} sub={data ? `of ${fmt.format(data.entered)} that entered` : undefined} />
        <Kpi icon={CalendarCheck} tone="teal" label={`Regulars, ${REGULAR}+ days`} value={data ? fmt.format(boats.filter((b) => b.days >= REGULAR).length) : "-"} sub="in the harbour" />
        <Kpi icon={Timer} label="Visits of 10+ min" value={data ? fmt.format(boats.reduce((a, b) => a + b.stays, 0)) : "-"} spark={data?.days.map((d) => d.boats)} />
        <Kpi icon={Route} tone="teal" label="Arrivals from islands" value={data ? fmt.format(boats.reduce((a, b) => a + b.tripsIn, 0)) : "-"} sub="trips in from other islands" />
        <Kpi icon={Clock} tone="amber" label="Busiest hour" value={data ? hh(busiest) : "-"} sub={data ? `${fmt.format(data.hours[busiest])} arrivals` : undefined} />
        <Kpi icon={Ship} tone="slate" label="Median stay" value={data ? `${short(typeMedian("fast"))} / ${short(typeMedian("dhoni"))}` : "-"} sub="speedboat / dhoni" />
      </Kpis>

      <Grid>
        <Panel span={8} flush icon={MapIcon} title="Where boats come from">
          <div className={s.map}>{data ? <HarbourMap data={data} /> : <Loading height={620} />}</div>
        </Panel>

        <div className={s.stack}>
          <Panel title="Arrivals by hour" icon={Clock}>
            {data ? (
              <Columns
                data={data.hours.map((v, h) => ({ x: String(h).padStart(2, "0"), total: v, part: v }))}
                height={200}
                every={6}
                tip={(c) => `${c.x}:00, ${fmt.format(c.total)} arrivals`}
              />
            ) : (
              <Loading height={200} />
            )}
          </Panel>
          <Panel title="By boat type" icon={Ship}>
            {data ? (
              <ul className={s.types}>
                {TYPES.map((t) => (
                  <li key={t} className={s.typeRow} data-type={t}>
                    <span className={s.disc}>
                      <BoatIcon type={t} />
                    </span>
                    <span>
                      <span className={s.typeName}>{TYPE[t]}</span>
                      <span className={`${s.typeSub} num`}>{fmt.format(boats.filter((b) => b.type === t).length)} boats</span>
                    </span>
                    <span className={s.typeStay}>
                      <b className="num">{stay(typeMedian(t))}</b>
                      <span className={s.typeSub}>median stay</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Loading height={200} />
            )}
          </Panel>
        </div>

        <Panel
          span={12}
          title="Boats"
          icon={List}
          actions={
            <Segmented<Filter>
              label="Boat type"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "fast", label: "Speedboats" },
                { value: "dhoni", label: "Dhonis" },
                { value: "slow", label: "Slow boats" },
              ]}
            />
          }
        >
          {data ? <BoatTable data={data} filter={filter} /> : <Loading height={600} />}
        </Panel>
      </Grid>
    </Dash>
  );
}
