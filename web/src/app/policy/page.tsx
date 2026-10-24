"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { BarChart, InlineBar, Panel, Stat } from "@/components/policy/charts";

// Shapes of the dataset endpoints (see the API guide, "Dataset endpoints").
interface Network {
  places: { id: string; name: string }[];
  index: { code: string; island: string; atoll: string; pop: number; depWeek: number; boats: number; dests: number; index: number }[];
  daily: { d: string; n: number; islands: number }[];
  totals: { days: number; boats: number; trips: number; population: number };
}
interface Sea {
  regions: Record<string, { name: string }>;
  roughWave: Record<string, number>;
  days: { d: string; r: Record<string, { idx: number | null; wave: number; rough: boolean | null; boats: number }> }[];
}
interface Safety {
  summary: { days: number; rough: boolean; trips: number; crossings: number; fastCrossings: number; nightCrossings: number }[];
  crossingRates: { rough: boolean; perDay: number }[];
  fullSpeed: { split: { pct: number; rough: boolean }[] };
  roughRoutes: { from: string; to: string; region: string; n: number; days: number; night: number; maxWave: number }[];
}
interface Signal {
  zones: { name: string; cells: number; km: number; boats: number; latePct: number }[];
  total: { cells: number; pings: number; latePct: number; deadCells: number };
}
interface Harbour {
  entered: number;
  hours: number[];
  boats: unknown[];
  origins: { id: string; name: string; n: number }[];
}

interface Ridership {
  sample: boolean;
  note: string;
  rows: { at: string; route: string; paid: number; foc: number; total: number }[];
}
interface BusRouteInfo {
  code: string;
  from: { en: string };
  to: { en: string };
  color: string;
}

type Load<T> = { s: "loading" } | { s: "ok"; d: T } | { s: "error"; msg: string };

/** GET through our server (which adds the token). 401 = logged out. */
function usePolicy<T>(path: string, onAuthLost: () => void): Load<T> {
  const [st, setSt] = useState<Load<T>>({ s: "loading" });
  useEffect(() => {
    let live = true;
    fetch(`/policy/api/data/${path}`)
      .then(async (r) => {
        if (r.status === 401) return onAuthLost();
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { detail?: string } | null)?.detail ?? String(r.status));
        const d = (await r.json()) as T;
        if (live) setSt({ s: "ok", d });
      })
      .catch((e: Error) => live && setSt({ s: "error", msg: e.message }));
    return () => {
      live = false;
    };
  }, [path, onAuthLost]);
  return st;
}

const n0 = (v: number) => Math.round(v).toLocaleString();
const day = (d: string) => String(Number(d.slice(8, 10)));

export default function PolicyDashboard() {
  const router = useRouter();
  const [authLost] = useState(() => () => router.replace("/policy/login"));
  const me = usePolicy<Record<string, unknown>>("auth/me", authLost);
  const net = usePolicy<Network>("network", authLost);
  const sea = usePolicy<Sea>("sea", authLost);
  const safety = usePolicy<Safety>("safety", authLost);
  const signal = usePolicy<Signal>("signal", authLost);
  const harbour = usePolicy<Harbour>("harbour", authLost);
  const rides = usePolicy<Ridership>("bus-ridership?period=month", authLost);
  const busRoutes = usePolicy<BusRouteInfo[]>("bus-routes", authLost);
  const [q, setQ] = useState("");

  const logout = async () => {
    await fetch("/policy/api/logout", { method: "POST" });
    router.replace("/policy/login");
  };

  const user = me.s === "ok" ? me.d : null;
  const username = String(user?.username ?? user?.name ?? "");
  const role = String(user?.role ?? "");

  const lowest = useMemo(() => {
    if (net.s !== "ok") return [];
    const query = q.trim().toLowerCase();
    return [...net.d.index]
      .filter((i) => !query || i.island.toLowerCase().includes(query) || i.atoll.toLowerCase().includes(query))
      .sort((a, b) => a.index - b.index)
      .slice(0, query ? 40 : 15);
  }, [net, q]);

  const seaRows = useMemo(() => {
    if (sea.s !== "ok") return [];
    return Object.entries(sea.d.regions).map(([key, r]) => {
      const days = sea.d.days.map((d) => d.r[key]).filter(Boolean);
      const idx = days.map((d) => d.idx).filter((x): x is number => x != null);
      return {
        key,
        name: r.name,
        rough: days.filter((d) => d.rough).length,
        meanIdx: idx.length ? idx.reduce((a, b) => a + b, 0) / idx.length : null,
        minIdx: idx.length ? Math.min(...idx) : null,
        roughWave: sea.d.roughWave[key],
      };
    });
  }, [sea]);

  return (
    <>
      <header className="sticky top-0 z-10 bg-[#0b1a66] text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-extrabold">Maasinga</span>
            <span className="text-[13px] text-white/60">Policy</span>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            {username && (
              <span className="hidden text-white/75 sm:inline">
                {username}
                {role && <span className="ms-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide">{role}</span>}
              </span>
            )}
            <button onClick={logout} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <p className="text-[13px] text-[#0b1a66]/55">
          Boat GPS from FollowMe, 1–31 August 2025, with ERA5 and NASA IMERG weather and the 2022 Census.
        </p>

        {/* Headline numbers */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {net.s === "ok" ? (
            <>
              <Stat label="Trips" value={n0(net.d.totals.trips)} note={`${net.d.totals.days} days`} />
              <Stat label="Boats" value={n0(net.d.totals.boats)} note="made at least one trip" />
              <Stat label="Islands indexed" value={n0(net.d.index.length)} />
              <Stat label="Population covered" value={n0(net.d.totals.population)} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[20px] bg-white" />)
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Trips per day" sub="Every boat trip between two stops, August 2025.">
            {net.s === "ok" ? (
              <BarChart
                data={net.d.daily.map((d) => ({ label: day(d.d), value: d.n, title: `${d.d} · ${d.islands} islands` }))}
                tickEvery={5}
              />
            ) : (
              <Placeholder load={net} />
            )}
          </Panel>

          <Panel title="Sea Pace Index" sub="Speedboat speed against normal (1.00 = normal) by sea region. Rough days: waves in the top quarter.">
            {sea.s === "ok" ? (
              <table className="w-full text-[14px]">
                <thead className="text-[11px] uppercase tracking-wide text-[#0b1a66]/45">
                  <tr>
                    <th className="py-1.5 text-start font-semibold">Region</th>
                    <th className="py-1.5 text-end font-semibold">Mean</th>
                    <th className="py-1.5 text-end font-semibold">Worst day</th>
                    <th className="py-1.5 text-end font-semibold">Rough days</th>
                  </tr>
                </thead>
                <tbody>
                  {seaRows.map((r) => (
                    <tr key={r.key} className="border-t border-[#0b1a66]/[0.06]">
                      <td className="py-2 font-semibold">{r.name}</td>
                      <td className="py-2 text-end tabular-nums">{r.meanIdx?.toFixed(2) ?? "–"}</td>
                      <td className="py-2 text-end tabular-nums">{r.minIdx?.toFixed(2) ?? "–"}</td>
                      <td className="py-2 text-end tabular-nums">
                        {r.rough} <span className="text-[#0b1a66]/45">(≥{r.roughWave?.toFixed(1)} m)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Placeholder load={sea} />
            )}
          </Panel>
        </div>

        <Panel
          className="mt-4"
          title="Travel Index: least connected islands"
          sub="Lower = fewer departures per week, boats and destinations for the island's population."
        >
          {net.s === "ok" ? (
            <>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search island or atoll"
                className="mb-3 h-10 w-full max-w-xs rounded-xl border border-[#0b1a66]/15 px-3.5 text-[14px] outline-none focus:border-[#1f3fd6]"
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead className="text-[11px] uppercase tracking-wide text-[#0b1a66]/45">
                    <tr>
                      <th className="py-1.5 text-start font-semibold">Island</th>
                      <th className="py-1.5 text-end font-semibold">Pop.</th>
                      <th className="py-1.5 text-end font-semibold">Dep./week</th>
                      <th className="py-1.5 text-end font-semibold">Boats</th>
                      <th className="py-1.5 text-end font-semibold">Dest.</th>
                      <th className="w-[28%] py-1.5 ps-4 text-start font-semibold">Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowest.map((i) => (
                      <tr key={i.code} className="border-t border-[#0b1a66]/[0.06]">
                        <td className="py-2">
                          <span className="font-semibold">{i.island}</span> <span className="text-[#0b1a66]/45">{i.atoll}</span>
                        </td>
                        <td className="py-2 text-end tabular-nums">{n0(i.pop)}</td>
                        <td className="py-2 text-end tabular-nums">{i.depWeek.toFixed(1)}</td>
                        <td className="py-2 text-end tabular-nums">{i.boats}</td>
                        <td className="py-2 text-end tabular-nums">{i.dests}</td>
                        <td className="py-2 ps-4">
                          <div className="flex items-center gap-2">
                            <span className="w-10 text-end tabular-nums">{i.index.toFixed(2)}</span>
                            <InlineBar value={i.index} max={Math.max(...net.d.index.map((x) => x.index))} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Placeholder load={net} />
          )}
        </Panel>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Safety" sub="Crossings between atolls, calm days against rough days.">
            {safety.s === "ok" ? (
              <SafetyView s={safety.d} names={net.s === "ok" ? new Map(net.d.places.map((p) => [p.id, p.name])) : new Map()} />
            ) : (
              <Placeholder load={safety} />
            )}
          </Panel>
          <Panel title="Phone signal dead zones" sub="Sea areas where boats' positions arrive late (no signal).">
            {signal.s === "ok" ? (
              <>
                <div className="mb-3 text-[13px] text-[#0b1a66]/60">
                  {n0(signal.d.total.deadCells)} dead cells of {n0(signal.d.total.cells)} · {signal.d.total.latePct.toFixed(1)}% of all positions late
                </div>
                <table className="w-full text-[14px]">
                  <thead className="text-[11px] uppercase tracking-wide text-[#0b1a66]/45">
                    <tr>
                      <th className="py-1.5 text-start font-semibold">Zone</th>
                      <th className="py-1.5 text-end font-semibold">km</th>
                      <th className="py-1.5 text-end font-semibold">Boats</th>
                      <th className="py-1.5 text-end font-semibold">Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signal.d.zones.map((z) => (
                      <tr key={z.name} className="border-t border-[#0b1a66]/[0.06]">
                        <td className="py-2 font-semibold">{z.name}</td>
                        <td className="py-2 text-end tabular-nums">{z.km}</td>
                        <td className="py-2 text-end tabular-nums">{z.boats}</td>
                        <td className="py-2 text-end tabular-nums">{z.latePct.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <Placeholder load={signal} />
            )}
          </Panel>
        </div>

        <Panel className="mt-4" title="Greater Malé bus ridership" sub="Passengers per month on MTCC / RTL routes, January 2023 to December 2025.">
          {rides.s === "ok" ? (
            <RidershipView r={rides.d} routes={busRoutes.s === "ok" ? busRoutes.d : []} />
          ) : (
            <Placeholder load={rides} />
          )}
        </Panel>

        <Panel className="mt-4" title="Malé North Harbour" sub="Boats entering the harbour by hour of day, and where they came from.">
          {harbour.s === "ok" ? (
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div>
                <div className="mb-3 text-[13px] text-[#0b1a66]/60">
                  {n0(harbour.d.entered)} boats entered · {n0(harbour.d.boats.length)} boats stayed
                </div>
                <BarChart
                  data={harbour.d.hours.map((v, h) => ({ label: String(h).padStart(2, "0"), value: v, title: `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59` }))}
                  tickEvery={3}
                />
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#0b1a66]/45">Top origins</div>
                <ul className="space-y-2 text-[14px]">
                  {harbour.d.origins.slice(0, 8).map((o) => (
                    <li key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                      <span className="truncate font-semibold">{o.name}</span>
                      <span className="tabular-nums text-[#0b1a66]/60">{o.n}</span>
                      <span className="col-span-2">
                        <InlineBar value={o.n} max={harbour.d.origins[0]?.n ?? 1} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <Placeholder load={harbour} />
          )}
        </Panel>
      </main>
    </>
  );
}

function SafetyView({ s, names }: { s: Safety; names: Map<string, string> }) {
  // Place ids to names; unnamed stop sites stay recognisable by their code.
  const placeName = (id: string) => {
    const n = names.get(id);
    return n && n !== "Unnamed site" ? n : n ? `Site ${id}` : id;
  };
  const calm = s.crossingRates.find((c) => !c.rough);
  const rough = s.crossingRates.find((c) => c.rough);
  const fsCalm = s.fullSpeed.split.find((x) => !x.rough);
  const fsRough = s.fullSpeed.split.find((x) => x.rough);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Crossings / region / day" value={`${n0(calm?.perDay ?? 0)} → ${n0(rough?.perDay ?? 0)}`} note="calm → rough days" />
        <Stat label="Kept full speed" value={`${fsCalm?.pct.toFixed(0)}% → ${fsRough?.pct.toFixed(0)}%`} note="speedboat days, calm → rough" />
      </div>
      <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-[#0b1a66]/45">Busiest routes on rough days</div>
      <ul className="divide-y divide-[#0b1a66]/[0.06] text-[14px]">
        {s.roughRoutes.slice(0, 6).map((r) => (
          <li key={`${r.from}|${r.to}`} className="flex items-center justify-between gap-3 py-2">
            <span className="truncate">
              <span className="font-semibold">{placeName(r.from)}</span> → <span className="font-semibold">{placeName(r.to)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-[#0b1a66]/60">
              {r.n} trips · {r.night} at night · waves to {r.maxWave.toFixed(1)} m
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (at: string) => `${MONTHS[Number(at.slice(5, 7)) - 1]} ${at.slice(2, 4)}`;

function RidershipView({ r, routes }: { r: Ridership; routes: BusRouteInfo[] }) {
  const months = [...new Set(r.rows.map((x) => x.at))].sort();
  const byMonth = months.map((m) => ({
    label: monthLabel(m),
    value: r.rows.filter((x) => x.at === m).reduce((a, x) => a + x.total, 0),
    title: monthLabel(m),
  }));
  const last12 = new Set(months.slice(-12));
  const prev12 = new Set(months.slice(-24, -12));
  const codes = [...new Set(r.rows.map((x) => x.route))];
  const rows = codes
    .map((code) => {
      const cur = r.rows.filter((x) => x.route === code && last12.has(x.at));
      const prev = r.rows.filter((x) => x.route === code && prev12.has(x.at));
      const total = cur.reduce((a, x) => a + x.total, 0);
      const free = cur.reduce((a, x) => a + x.foc, 0);
      const before = prev.reduce((a, x) => a + x.total, 0);
      const info = routes.find((x) => x.code === code);
      return { code, info, total, freePct: total ? (free / total) * 100 : 0, change: before ? ((total - before) / before) * 100 : null };
    })
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((x) => x.total));
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <BarChart data={byMonth} tickEvery={6} />
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="text-[11px] uppercase tracking-wide text-[#0b1a66]/45">
              <tr>
                <th className="py-1.5 text-start font-semibold">Route</th>
                <th className="w-[38%] py-1.5 text-start font-semibold">Last 12 months</th>
                <th className="py-1.5 text-end font-semibold">Free</th>
                <th className="py-1.5 text-end font-semibold">vs year before</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.code} className="border-t border-[#0b1a66]/[0.06]">
                  <td className="py-2" title={x.info ? `${x.info.from.en} → ${x.info.to.en}` : undefined}>
                    <span className="font-semibold">{x.code}</span>
                    {x.info && <span className="ms-1.5 text-[12px] text-[#0b1a66]/45">{x.info.to.en}</span>}
                  </td>
                  <td className="py-2 pe-3">
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-end tabular-nums">{n0(x.total / 1000)}k</span>
                      <InlineBar value={x.total} max={max} />
                    </div>
                  </td>
                  <td className="py-2 text-end tabular-nums">{x.freePct.toFixed(0)}%</td>
                  <td className="py-2 text-end tabular-nums">
                    {x.change == null ? "–" : `${x.change > 0 ? "+" : ""}${x.change.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Placeholder({ load }: { load: Load<unknown> }) {
  if (load.s === "error") return <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">Couldn&apos;t load: {load.msg}</p>;
  return <div className="h-40 animate-pulse rounded-xl bg-[#0b1a66]/[0.04]" />;
}
