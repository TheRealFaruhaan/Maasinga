"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Clock, Map as MapIcon, Navigation, Ship, Timer, Waves, WifiOff } from "lucide-react";
import DepartureRow from "./DepartureRow";
import RouteBoats, { type RouteBoat } from "./RouteBoats";
import { Dash, Grid, Panel } from "@/components/dash";
import { Failed, Loading, Picker, Segmented } from "@/components/ui";
import { fmt1, useData, type NetworkData, type Place, type RegionKey, type Route, type SeaData, type SignalData } from "@/lib/data";
import s from "./travel.module.css";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <Loading height={640} /> });

const DEFAULT = { from: "MLE.Male", to: "K.Maafushi" };

function regionOf(lat: number): RegionKey {
  if (lat >= 5.5) return "north";
  if (lat >= 3.5) return "central";
  if (lat >= 1.8) return "midsouth";
  return "south";
}

/** Open-Meteo marine forecast, highest wave per day over the region's points (same scale as the August history). */
function useForecast(points: [number, number][] | null) {
  const [days, setDays] = useState<{ key: string; data: { d: string; wave: number }[] | Error } | null>(null);
  const key = points ? points.map((p) => p.join(",")).join(";") : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    const pts = key.split(";").map((p) => p.split(","));
    const lat = pts.map((p) => p[0]).join(",");
    const lon = pts.map((p) => p[1]).join(",");
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&timezone=Indian%2FMaldives&forecast_days=3`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        const all: { daily: { time: string[]; wave_height_max: (number | null)[] } }[] = Array.isArray(j) ? j : [j];
        const data = all[0].daily.time.map((d, i) => ({ d, wave: Math.max(...all.map((a) => a.daily.wave_height_max[i] ?? 0)) }));
        if (live) setDays({ key, data });
      })
      .catch((e: Error) => live && setDays({ key, data: e }));
    return () => {
      live = false;
    };
  }, [key]);
  return days && days.key === key ? days.data : undefined;
}

type Rating = { word: "Calm sea" | "Choppy" | "Rough"; tone: "positive" | "warning" | "negative"; loss: number };

/** Where the expected slowdown sits on the three-band gauge (0 to 100%). */
function gaugePos(loss: number) {
  if (loss < 5) return (loss / 5) * 33.3;
  if (loss < 10) return 33.3 + ((loss - 5) / 5) * 33.3;
  return Math.min(98, 66.6 + ((loss - 10) / 10) * 33.3);
}

/** Minutes since midnight, Maldives time. */
function nowMaldives() {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Indian/Maldives", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Rating from the Sea Pace model: expected speed loss against a calm day in that region
 * (calm = the 25th percentile of August wave heights). Under 5% go, 5 to 10% take care, over 10% avoid.
 */
function rate(sea: SeaData, region: RegionKey, wave: number): Rating {
  const waves = sea.days.map((d) => d.r[region].wave).sort((a, b) => a - b);
  const calm = waves[Math.floor(waves.length * 0.25)];
  const loss = Math.max(0, -sea.regions[region].slope * (wave - calm) * 100);
  if (loss < 5) return { word: "Calm sea", tone: "positive", loss };
  if (loss < 10) return { word: "Choppy", tone: "warning", loss };
  return { word: "Rough", tone: "negative", loss };
}

function nameOf(p: Place) {
  return p.atoll && p.atoll !== "Male City" ? `${p.name}, ${p.atoll}` : p.name;
}

export default function TravelPage() {
  const net = useData<NetworkData>("network.json");
  const sea = useData<SeaData>("sea.json");
  const sig = useData<SignalData>("signal.json");
  const paths = useData<Record<string, number[]>>("paths.json");
  const routeBoats = useData<Record<string, RouteBoat[]>>("route-boats.json");
  const [from, setFrom] = useState(DEFAULT.from);
  const [to, setTo] = useState(DEFAULT.to);
  const [when, setWhen] = useState<"0" | "1">("1");

  const n = net && !(net instanceof Error) ? net : null;
  const seaOk = sea && !(sea instanceof Error) ? sea : null;

  const places = useMemo(() => new Map((n?.places ?? []).map((p) => [p.id, p])), [n]);
  // Only named places with routes are offered; unnamed sites are left out of the public list.
  const usable = (id: string) => {
    const p = places.get(id);
    return !!p && p.name !== "Unnamed site";
  };
  const routes = useMemo(() => (n ? n.routes.filter((r) => usable(r.from) && usable(r.to)) : []), [n, places]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromOptions = useMemo(() => {
    const ids = Array.from(new Set(routes.map((r) => r.from)));
    return ids
      .map((id) => places.get(id)!)
      .sort((a, b) => (a.atoll ?? "Resorts").localeCompare(b.atoll ?? "Resorts") || a.name.localeCompare(b.name))
      .map((p) => ({ value: p.id, label: p.name, group: p.kind === "island" ? (p.atoll ?? "") : "Resorts and other islands" }));
  }, [routes, places]);
  const toOptions = useMemo(
    () =>
      routes
        .filter((r) => r.from === from)
        .sort((a, b) => b.n - a.n)
        .map((r) => ({ value: r.to, label: nameOf(places.get(r.to)!) })),
    [routes, from, places],
  );

  const route: Route | undefined = routes.find((r) => r.from === from && r.to === to);
  const a = places.get(from);
  const b = places.get(to);

  const path = useMemo<[number, number][]>(() => {
    if (!a || !b) return [];
    const raw = paths && !(paths instanceof Error) ? paths[`${from}|${to}`] : undefined;
    const pts: [number, number][] = [[a.lon, a.lat]];
    if (raw) for (let i = 0; i < raw.length; i += 2) pts.push([raw[i] / 10000, raw[i + 1] / 10000]);
    pts.push([b.lon, b.lat]);
    return pts;
  }, [paths, from, to, a, b]);

  // Dead-zone cells within about 4 km of the route.
  const deadCells = useMemo(() => {
    if (!sig || sig instanceof Error || path.length < 2) return [];
    return sig.cells.filter((c) => c[2] >= 25 && path.some((p) => Math.abs(p[0] - c[0]) < 0.04 && Math.abs(p[1] - c[1]) < 0.04));
  }, [sig, path]);

  const mid = path.length ? path[Math.floor(path.length / 2)] : null;
  const region = mid ? regionOf(mid[1]) : "central";
  const point = seaOk ? seaOk.regions[region] : null;
  const forecast = useForecast(point ? (point.points ?? [[point.lat, point.lon]]) : null);
  const day = forecast && !(forecast instanceof Error) ? forecast[Number(when)] : undefined;
  const rating = seaOk && day ? rate(seaOk, region, day.wave) : null;

  const changeFrom = (id: string) => {
    setFrom(id);
    const first = routes.filter((r) => r.from === id).sort((x, y) => y.n - x.n)[0];
    if (first) setTo(first.to);
  };
  const swap = () => {
    if (routes.some((r) => r.from === to && r.to === from)) {
      setFrom(to);
      setTo(from);
    }
  };

  if (net instanceof Error)
    return (
      <Dash title="Plan a trip" sub="Real departures, tomorrow's sea and phone signal">
        <Failed what="routes" />
      </Dash>
    );

  const usual = route?.usual ?? [];
  const late = route?.latePct ?? null;
  // Today: past departures fade and the next one is marked. Tomorrow: all shown alike.
  const now = when === "0" ? nowMaldives() : -1;

  return (
    <Dash title="Plan a trip" sub="Real departures, tomorrow's sea and phone signal">
      <Grid>
        <div className={s.stack}>
          <Panel title="Route" icon={Navigation}>
            {n ? (
              <div className={s.route}>
                <span className={s.end}>
                  <i className={s.dotFrom} />
                  From
                </span>
                <Picker label="" placeholder="From" value={from} onChange={changeFrom} options={fromOptions} />
                <button className={s.swap} onClick={swap} aria-label="Swap direction" title="Swap direction">
                  <ArrowUpDown size={18} />
                </button>
                <span className={s.end}>
                  <i className={s.dotTo} />
                  To
                </span>
                <Picker label="" placeholder="To" value={to} onChange={setTo} options={toOptions} />
              </div>
            ) : (
              <Loading height={110} />
            )}
          </Panel>

          <Panel
            title="Sea"
            icon={Waves}
            actions={<Segmented<"0" | "1"> label="Day" value={when} onChange={setWhen} options={[{ value: "0", label: "Today" }, { value: "1", label: "Tomorrow" }]} />}
          >
            {rating && day ? (
              <>
                <div className={s.seaTop}>
                  <div>
                    <div className={`${s.wave} num`}>
                      {fmt1.format(day.wave)}
                      <span>m</span>
                    </div>
                    <div className={s.waveLabel}>highest wave {when === "0" ? "today" : "tomorrow"}</div>
                  </div>
                  <span className={`${s.state} ${s[rating.tone]}`}>{rating.word}</span>
                </div>
                <div className={s.gauge} aria-hidden="true">
                  <div className={s.bands}>
                    <i className={s.positive} />
                    <i className={s.warning} />
                    <i className={s.negative} />
                  </div>
                  <span className={s.marker} style={{ left: `${gaugePos(rating.loss)}%` }} />
                  <div className={s.bandLabels}>
                    <span>Calm</span>
                    <span>Choppy</span>
                    <span>Rough</span>
                  </div>
                </div>
                <p className={s.waves}>
                  {rating.loss < 1 ? "Boats run at their normal speed." : <>Boats run about <b className="num">{Math.round(rating.loss)}%</b> slower than on a calm day.</>}
                </p>
              </>
            ) : forecast instanceof Error ? (
              <p className={s.waves}>The forecast needs internet.</p>
            ) : (
              <Loading height={150} />
            )}
          </Panel>

        </div>

        <Panel
          span={8}
          flush
          title={a && b ? `${a.name} to ${b.name}` : "Route map"}
          icon={MapIcon}
          actions={
            route && (
              <>
                <span className={`${s.chip} num`}>
                  <Timer size={16} />
                  {route.mins} min
                </span>
                <span className={`${s.chip} num`}>
                  <Ship size={16} />
                  {route.boats} boats, {route.n} trips
                </span>
                <span className={`${s.chip} num`} style={late !== null && late >= 25 ? { color: "var(--negative)" } : undefined}>
                  <WifiOff size={16} />
                  {late === null ? "-" : `${fmt1.format(late)}%`} no signal
                </span>
              </>
            )
          }
        >
          <div className={s.map}>
            <div className={s.mapFill}>{a && b && path.length > 1 ? <RouteMap from={a} to={b} path={path} deadCells={deadCells} /> : <Loading height={640} />}</div>
          </div>
        </Panel>

        <Panel span={12} title="Departures" icon={Clock}>
          {route ? (
            usual.length ? (
              <DepartureRow key={`${from}|${to}`} usual={usual} now={now} />
            ) : (
              <p className={s.waves}>No regular times: boats leave across the day.</p>
            )
          ) : (
            <Loading height={40} />
          )}
        </Panel>

        <Panel span={12} title={route ? `Boats on this route (${route.boats})` : "Boats on this route"} icon={Ship}>
          {routeBoats && !(routeBoats instanceof Error) && route ? (
            <RouteBoats key={`${from}|${to}`} boats={routeBoats[`${from}|${to}`] ?? []} />
          ) : (
            <Loading height={420} />
          )}
        </Panel>
      </Grid>
    </Dash>
  );
}
