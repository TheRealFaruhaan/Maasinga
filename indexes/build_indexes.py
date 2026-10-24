#!/usr/bin/env python3
"""Passenger and goods transport indexes per inhabited island (reference implementation).

  python3 indexes/build_indexes.py [maasinga_web_data dir] [team_kandu dir]

Two indexes, each 0-100, higher = better:
  PTI  Passenger Transport Index  speedboats (RTL ferries are speedboats) = mean(access, resilience)
  GTI  Goods Transport Index      dhoni + slow boats                       = mean(supply, resilience)
All trip counts come from FollowMe GPS only (RTL ferries are tracked there too: no double counting).
The RTL timetable is used only as "island has scheduled public ferry service" (yes/no).
Indicators, weights and goalposts: indexes/indicators.json. Spec: indexes/INDEX_SPEC.md.

Writes indexes/out/: islands.csv, islands.json, critical_boats.csv, summary.json
"""
import collections
import csv
import heapq
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw", "maasinga_web_data")
KANDU = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "raw", "team_kandu")
OUT = os.path.join(HERE, "out")

MALE = {"MLE.Male", "MLE.Hulhumale", "MLE.Vilimale", "MLE.Hulhule"}   # Male hub (bridged); destination, not scored
PAX = {"fast"}                                                       # passenger boats: speedboats (incl. RTL ferries)
CARGO = {"dhoni", "slow"}                                            # goods boats
VESSEL_CLASS_FILE = os.path.join(HERE, "extra", "vessel_class.csv")  # optional override: boat,class (pax|goods), e.g. from MTCC
DAYS = 31                                                            # days in the data window
MIN_COVERAGE = 0.3      # below this, boat-level counts/shares for the island are unknown
AIRPORT_KM = 15         # airport counts as an alternative within this distance
STOP_KM, BUS_KM, NEAR_KM = 2.0, 1.0, 3.0
AIRPORTS = {  # domestic airports: fixed coordinates, or the island whose coordinates to use
    "GAN": (-0.693, 73.156), "HAQ": (6.744, 73.170), "KDO": (1.859, 73.522), "KDM": (0.488, 72.996),
    "MLE": (4.192, 73.529), "DRV": "B.Dharavandhoo", "FMT": "GDh.Faresmaathoda", "FND": "Sh.Funadhoo",
    "FVM": "Gn.Fuvahmulah", "HRF": "HA.Hoarafushi", "IFU": "R.Ifuru", "GKK": "GA.Kooddoo",
    "DDD": "Dh.Kudahuvadhoo", "HDK": "HDh.Kulhudhuffushi", "NMF": "N.Maafaru", "RUL": "GDh.Maavarulu",
    "LMV": "Lh.Madivaru", "MUM": "M.Muli", "TMF": "Th.Thimarafushi",
}


def load(name):
    with open(os.path.join(SRC, name)) as f:
        return json.load(f)


def kandu(name):
    with open(os.path.join(KANDU, name)) as f:
        return list(csv.DictReader(f))


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def dijkstra(adj, sources):
    dist = {s: 0.0 for s in sources}
    pq = [(0.0, s) for s in sources]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj.get(u, ()):
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w
                heapq.heappush(pq, (d + w, v))
    return dist


# ------------------------------------------------------------------ scoring

def goalpost(v, ind):
    if v is None and ind.get("missing_as_worst"):
        return 0.0
    if v is None:
        return None
    lo, hi = ind["goalposts"]
    g = math.log1p if ind.get("log") else (lambda x: x)
    u = min(1.0, max(0.0, (g(v) - g(lo)) / (g(hi) - g(lo)))) * 100
    return u if ind["direction"] > 0 else 100 - u


def pct_rank(values, ind):
    vals = list(values)
    if ind.get("missing_as_worst"):
        known = [v for v in vals if v is not None]
        worst = (max(known) * 10 + 1) if ind["direction"] < 0 else (min(known) - 1)
        vals = [worst if v is None else v for v in vals]
    order = sorted((v, i) for i, v in enumerate(vals) if v is not None)
    out, n, i = [None] * len(vals), len(order), 0
    while i < n:
        j = i
        while j + 1 < n and order[j + 1][0] == order[i][0]:
            j += 1
        u = ((i + j) / 2) / (n - 1) * 100 if n > 1 else 50.0
        for k in range(i, j + 1):
            out[order[k][1]] = u if ind["direction"] > 0 else 100 - u
        i = j + 1
    return out


def wmean(parts):
    parts = [(v, w) for v, w in parts if v is not None]
    tw = sum(w for _, w in parts)
    return sum(v * w for v, w in parts) / tw if tw else None


# ------------------------------------------------------------------ build

def main():
    net, rb, harbour, sea = load("network.json"), load("route-boats.json"), load("harbour.json"), load("sea.json")
    places = {p["id"]: p for p in net["places"]}
    islands = [i for i in net["index"] if i["code"] not in MALE]
    codes = {i["code"] for i in islands}
    pos = {c: (places[c]["lat"], places[c]["lon"]) for c in codes if c in places}

    # ---- RTL: stops -> islands (scheduled service flag) and direct island pairs (for the ferry proxy)
    def nearest(lat, lon, max_km):
        best = min(((km(p, (lat, lon)), c) for c, p in all_pos.items()), default=(1e9, None))
        return best[1] if best[0] <= max_km else None

    all_pos = {k: (p["lat"], p["lon"]) for k, p in places.items()}
    stop_place = {s["name"]: nearest(float(s["lat"]), float(s["lon"]), STOP_KM) for s in kandu("rtl_stops.csv")}
    scheduled = {stop_place[t["stop"]] for t in kandu("rtl_trips.csv") if stop_place.get(t["stop"])}

    # ---- boat classes: passenger = speedboat, goods = dhoni/slow
    btype = {}
    for boats in rb.values():
        for code, typ, *_ in boats:
            btype[code] = typ
    for bt in harbour["boats"]:
        btype.setdefault(bt["id"], bt["type"])

    override = {}
    if os.path.exists(VESSEL_CLASS_FILE):
        override = {x["boat"]: x["class"] for x in csv.DictReader(open(VESSEL_CLASS_FILE))}

    def cls(b):
        if b in override:
            return override[b]
        return "pax" if btype.get(b) in PAX else ("goods" if btype.get(b) in CARGO else None)

    # ---- boat trips per island and class (regular routes = 20+ trips/month), both directions
    trips = collections.defaultdict(collections.Counter)        # island -> boat -> trips touching island
    dep_by_cls = collections.defaultdict(collections.Counter)   # island -> class -> departures
    cross = collections.defaultdict(collections.Counter)        # island -> class -> trips on inter-atoll crossings
    pax_adj = collections.defaultdict(list)
    pax_dests = collections.defaultdict(set)
    for r in net["routes"]:
        a, b = r["from"], r["to"]
        atolls = {places.get(a, {}).get("atoll"), places.get(b, {}).get("atoll")}
        crossing = len(atolls) == 2 and None not in atolls and not ({a, b} & MALE and atolls & {"Kaafu", "Male City"})
        has_pax = False
        for code, typ, n, *_ in rb.get(f"{a}|{b}", []):
            k = cls(code)
            for isl in (a, b):
                if isl in codes:
                    trips[isl][code] += n
                    if crossing:
                        cross[isl][k] += n
            if a in codes:
                dep_by_cls[a][k] += n
            if k == "pax":
                has_pax = True
        if has_pax:
            pax_adj[a].append((b, r["mins"]))
            pax_adj[b].append((a, r["mins"]))
            pax_dests[a].add(b)
            pax_dests[b].add(a)

    # ---- North Harbour arrivals (goods boats only)
    harbour_cargo = collections.defaultdict(set)
    for bt in harbour["boats"]:
        if cls(bt["id"]) == "goods":
            for origin, _ in bt["origins"]:
                if origin in codes:
                    harbour_cargo[origin].add(bt["id"])

    # ---- airports
    stops_by_island = {s["name"].split(".")[-1].lower(): s for s in kandu("rtl_stops.csv")}
    ap = []
    for code, where in AIRPORTS.items():
        if isinstance(where, tuple):
            ap.append(where)
        elif where in places:
            ap.append((places[where]["lat"], places[where]["lon"]))
        elif where.split(".")[-1].lower() in stops_by_island:
            s = stops_by_island[where.split(".")[-1].lower()]
            ap.append((float(s["lat"]), float(s["lon"])))

    # ---- passenger travel time to Male
    pax_time = dijkstra(pax_adj, MALE)

    # ---- weather: speedboat slowdown on a rough day per region (sea.json is measured on speedboats)
    loss = {k: -v["slope"] * sea["roughWave"][k] for k, v in sea["regions"].items()}

    def region(lat):
        return min(sea["regions"], key=lambda k: abs(sea["regions"][k]["lat"] - lat))

    # ---- speedboat share of departures, island -> atoll -> national fallback
    def share(counter):
        t = sum(counter.values())
        return counter["pax"] / t if t else None
    atoll_dep = collections.defaultdict(collections.Counter)
    for i in islands:
        atoll_dep[i["atoll"]].update(dep_by_cls[i["code"]])
    national = sum((dep_by_cls[c] for c in codes), collections.Counter())

    rows = []
    for i in islands:
        c, pop = i["code"], i["pop"]
        month_dep = i["depWeek"] * DAYS / 7
        coverage = min(1.0, sum(dep_by_cls[c].values()) / month_dep) if month_dep else 0.0
        known = coverage >= MIN_COVERAGE
        fs = share(dep_by_cls[c]) if known else None
        fs_src = "island"
        if fs is None:
            fs, fs_src = share(atoll_dep[i["atoll"]]), "atoll"
        if fs is None:
            fs, fs_src = share(national), "national"
        pax_t = {b: n for b, n in trips[c].items() if cls(b) == "pax"}
        car_t = {b: n for b, n in trips[c].items() if cls(b) == "goods"}
        ferry = 1 if c in scheduled else 0
        lat_lon = pos.get(c)
        airport_km = round(min(km(lat_lon, a) for a in ap), 1) if lat_lon else None
        reg = region(lat_lon[0]) if lat_lon else None
        pax_cross = cross[c]["pax"] / sum(pax_t.values()) if pax_t else 0.0
        near = None
        if lat_lon and i["boats"] < 10:
            for j in islands:
                if j["code"] != c and j["boats"] > i["boats"] and j["code"] in pos and km(lat_lon, pos[j["code"]]) <= NEAR_KM:
                    near = j["code"]
                    break
        rows.append(dict(
            code=c, island=i["island"], atoll=i["atoll"], pop=pop, region=reg, lat=lat_lon and lat_lon[0], lon=lat_lon and lat_lon[1],
            dep_week_all=i["depWeek"], boats_all=i["boats"], route_coverage=round(coverage, 2),
            pax_share=round(fs, 3) if fs is not None else None, pax_share_source=fs_src,
            # passenger
            pax_dep_week_per_1000=round(i["depWeek"] * fs / pop * 1000, 2) if pop else None,
            pax_destinations=len(pax_dests[c]),
            pax_mins_to_male=round(pax_time[c]) if c in pax_time else None,
            scheduled_ferry=ferry, airport_km=airport_km,
            pax_boats=len(pax_t) if known else None,
            top_pax_boat=max(pax_t, key=pax_t.get) if pax_t and known else None,
            top_pax_share=round(max(pax_t.values()) / sum(pax_t.values()), 3) if pax_t and known else None,
            pax_alternatives=ferry + (1 if airport_km is not None and airport_km <= AIRPORT_KM else 0),
            pax_weather_exposure=round(pax_cross * loss[reg], 4) if reg and known else None,
            # goods
            cargo_dep_week_per_1000=round(i["depWeek"] * (1 - fs) / pop * 1000, 2) if pop else None,
            harbour_cargo_boats=len(harbour_cargo[c]),
            cargo_boats=len(set(car_t) | harbour_cargo[c]) if known else None,
            top_cargo_boat=max(car_t, key=car_t.get) if car_t and known else None,
            top_cargo_share=round(max(car_t.values()) / sum(car_t.values()), 3) if car_t and known else None,
            near_better_served=near,
        ))

    # ---- scores
    cfg = json.load(open(os.path.join(HERE, "indicators.json")))
    inds = [d for d in cfg["indicators"] if d.get("enabled", True)]
    for d in inds:  # extension data from CSV
        if d.get("source", "core") != "core":
            path = os.path.join(HERE, d["source"])
            ex = {x["code"]: x for x in csv.DictReader(open(path))} if os.path.exists(path) else {}
            for r in rows:
                v = ex.get(r["code"], {}).get(d.get("column", d["id"]), "")
                v = float(v) if v not in ("", None) else None
                r[d["id"]] = (v / r["pop"] * 1000 if v is not None and d.get("per_1000") and r["pop"] else v)
    ranks = {d["id"]: pct_rank([r.get(d["id"]) for r in rows], d) for d in inds}
    for n, r in enumerate(rows):
        for idx, comps in cfg["indexes"].items():
            for method, suffix in (("abs", ""), ("pct", "_rank")):
                comp_scores = []
                for comp in comps["components"]:
                    parts = [((goalpost(r.get(d["id"]), d) if method == "abs" else ranks[d["id"]][n]), d["weight"])
                             for d in inds if d["index"] == idx and d["component"] == comp]
                    s = wmean(parts)
                    r[f"{idx}_{comp}{suffix}"] = round(s, 1) if s is not None else None
                    comp_scores.append(s)
                m = wmean([(s, 1) for s in comp_scores])
                r[idx + suffix] = round(m, 1) if m is not None else None
        r["alerts"] = alerts(r)

    rows.sort(key=lambda r: (r["PTI"] or 0) + (r["GTI"] or 0))

    # ---- critical boats (separately for passenger and goods)
    crit = collections.defaultdict(lambda: {"islands": [], "residents": 0})
    for r in rows:
        for kind, b, s in (("passenger", r["top_pax_boat"], r["top_pax_share"]), ("goods", r["top_cargo_boat"], r["top_cargo_share"])):
            if b and s is not None and s >= 0.5:
                e = crit[(kind, b)]
                e["islands"].append(f"{r['code']} ({s:.0%})")
                e["residents"] += r["pop"]
    crit_rows = sorted(({"kind": k, "boat": b, "type": btype.get(b), "islands": len(v["islands"]), "residents": v["residents"],
                         "island_list": "; ".join(v["islands"])} for (k, b), v in crit.items()), key=lambda x: (x["kind"], -x["residents"]))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "islands.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow({**r, "alerts": "; ".join(r["alerts"])})
    json.dump(rows, open(os.path.join(OUT, "islands.json"), "w"), indent=1)
    with open(os.path.join(OUT, "critical_boats.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(crit_rows[0].keys()))
        w.writeheader()
        w.writerows(crit_rows)
    count = lambda code: sum(code in r["alerts"] for r in rows)
    summary = {
        "islands": len(rows), "population": sum(r["pop"] for r in rows),
        "alerts": {a: count(a) for a in ALERTS},
        "critical_boats": {k: sum(1 for x in crit_rows if x["kind"] == k) for k in ("passenger", "goods")},
        "residents_behind_critical_boats": {k: sum(x["residents"] for x in crit_rows if x["kind"] == k) for k in ("passenger", "goods")},
        "residents_PTI_below_30": sum(r["pop"] for r in rows if (r["PTI"] or 0) < 30),
        "residents_GTI_below_30": sum(r["pop"] for r in rows if (r["GTI"] or 0) < 30),
        "boat_level_unknown": sum(r["route_coverage"] < MIN_COVERAGE for r in rows),
        "with_scheduled_ferry": sum(r["scheduled_ferry"] for r in rows),
    }
    json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"), indent=1)
    print(json.dumps(summary, indent=1))


ALERTS = {
    "PAX_ONE_BOAT": "one speedboat carries half or more of passenger trips",
    "PAX_NO_PUBLIC": "no scheduled ferry and no airport within 15 km",
    "PAX_NO_REGULAR_PATH": "no regular speedboat/ferry path to Male",
    "GOODS_ONE_BOAT": "one cargo boat carries half or more of goods trips",
    "GOODS_FEW_BOATS": "one or no cargo boats seen",
    "LOW_COVERAGE": "boat-level detail unknown (few trips on regular routes)",
    "MAYBE_ROAD_LINKED": "few boats but a better-served island within 3 km",
}


def alerts(r):
    a = []
    known = r["route_coverage"] >= MIN_COVERAGE
    if r["top_pax_share"] is not None and r["top_pax_share"] >= 0.5:
        a.append("PAX_ONE_BOAT")
    if r["pax_alternatives"] == 0:
        a.append("PAX_NO_PUBLIC")
    if r["pax_mins_to_male"] is None:
        a.append("PAX_NO_REGULAR_PATH")
    if r["top_cargo_share"] is not None and r["top_cargo_share"] >= 0.5:
        a.append("GOODS_ONE_BOAT")
    if r["cargo_boats"] is not None and r["cargo_boats"] <= 1:
        a.append("GOODS_FEW_BOATS")
    if not known:
        a.append("LOW_COVERAGE")
    if r["near_better_served"]:
        a.append("MAYBE_ROAD_LINKED")
    return a


if __name__ == "__main__":
    main()
