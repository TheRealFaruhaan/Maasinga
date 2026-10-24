"""Boats that use the Male North Harbour area, one row per boat.

Area: pipeline/reference/north_harbour.geojson (drawn by the team).
Visit: the boat's positions fall inside the area; it ends when the boat is seen outside or after
a 2-hour gap. Stay: a visit of 10 minutes or more (shorter visits are boats passing the edge).
Trip into the harbour: a detected trip (step 4) whose arrival falls within a stay.

Output: data/work/north_harbour_boats.csv (has tracker IMEIs, so it stays local and is not committed)
"""
import csv
import hashlib
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import OUT, REF, WORK, db  # noqa: E402

MIN_STAY_S = 600
GAP_S = 7200

poly = json.load(open(REF / "north_harbour.geojson"))["geometry"]["coordinates"][0]


def inside(x, y):
    """Ray casting point-in-polygon."""
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


con = db()
rows = con.execute(f"""
select imei, cls, t, lon, lat from '{WORK / 'pings.parquet'}'
where lat between 4.17 and 4.19 and lon between 73.49 and 73.53 order by imei, t
""").fetchall()

visits, cls, cur = defaultdict(list), {}, {}
for imei, cl, t, lon, lat in rows:
    cls[imei] = cl
    v = cur.get(imei)
    if inside(lon, lat):
        if v is None or (t - v[1]).total_seconds() > GAP_S:
            if v:
                visits[imei].append(v)
            cur[imei] = [t, t]
        else:
            v[1] = t
    elif v is not None:
        visits[imei].append(v)
        cur[imei] = None
for imei, v in cur.items():
    if v:
        visits[imei].append(v)

# All detected trips of these boats, to count trips in total and trips that end in the harbour.
con.execute("create table b(imei varchar)")
con.executemany("insert into b values (?)", [(i,) for i in visits])
trips = defaultdict(list)
for imei, frm, arr in con.execute(f"select imei, from_place, arr from '{WORK / 'trips.parquet'}' semi join b using (imei)").fetchall():
    trips[imei].append((frm, arr))
names = {p["id"]: p["name"] for p in json.load(open(OUT / "network.json"))["places"]}

out = []
for imei, vs in visits.items():
    stays = [(a, b) for a, b in vs if (b - a).total_seconds() >= MIN_STAY_S]
    mins = [(b - a).total_seconds() / 60 for a, b in stays]
    into = [f for f, arr in trips[imei] if any(a <= arr <= b for a, b in stays)]
    top = sorted(Counter(names.get(f, f) for f in into).items(), key=lambda x: (-x[1], x[0]))[:3]
    out.append({
        "code": hashlib.md5(imei.encode()).hexdigest()[:6].upper(),
        "imei": imei,
        "boat_type": {"fast": "speedboat", "dhoni": "dhoni or ferry", "slow": "slow boat"}[cls[imei]],
        "entries": len(vs),
        "stays_10min": len(stays),
        "days_in_harbour": len({a.date() for a, _ in stays}),
        "hours_in_harbour": round(sum(mins) / 60, 1),
        "median_stay_min": round(statistics.median(mins)) if mins else 0,
        "longest_stay_h": round(max(mins) / 60, 1) if mins else 0,
        "trips_august": len(trips[imei]),
        "trips_into_harbour": len(into),
        "main_origins": "; ".join(f"{n} ({k})" for n, k in top),
        "first_seen": min(a for a, _ in vs).strftime("%Y-%m-%d %H:%M"),
        "last_seen": max(b for _, b in vs).strftime("%Y-%m-%d %H:%M"),
    })
out.sort(key=lambda r: (-r["stays_10min"], -r["hours_in_harbour"], r["code"]))

path = WORK / "north_harbour_boats.csv"
with open(path, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0]))
    w.writeheader()
    w.writerows(out)

used = [r for r in out if r["stays_10min"]]
print(f"boats entered {len(out)}, boats that stayed 10+ min {len(used)}")
print("stays", sum(r["stays_10min"] for r in used), "trips into harbour", sum(r["trips_into_harbour"] for r in used))
for t in ("speedboat", "dhoni or ferry", "slow boat"):
    g = [r for r in used if r["boat_type"] == t]
    if g:
        print(t, len(g), "boats, median stay", statistics.median(r["median_stay_min"] for r in g), "min, trips in", sum(r["trips_into_harbour"] for r in g))
print(f"wrote {path}")
for r in used[:15]:
    print(r["code"], r["boat_type"], r["stays_10min"], r["trips_into_harbour"], r["trips_august"], r["median_stay_min"], r["hours_in_harbour"], r["main_origins"])

# Web file: the same table with coded IDs only (no IMEI), plus origins, hours and days.
places = {p["id"]: p for p in json.load(open(OUT / "network.json"))["places"]}
origin_n = Counter()
hours = [0] * 24
days = defaultdict(set)
boats = []
for imei, vs in visits.items():
    stays = [(a, b) for a, b in vs if (b - a).total_seconds() >= MIN_STAY_S]
    if not stays:
        continue
    code = hashlib.md5(imei.encode()).hexdigest()[:6].upper()
    for a, _ in stays:
        hours[a.hour] += 1
        days[a.date().isoformat()].add(imei)
    into = Counter(f for f, arr in trips[imei] if any(a <= arr <= b for a, b in stays))
    origin_n.update(into)
    mins = [(b - a).total_seconds() / 60 for a, b in stays]
    boats.append({
        "id": code,
        "type": cls[imei],
        "stays": len(stays),
        "tripsIn": sum(into.values()),
        "tripsAug": len(trips[imei]),
        "medianMin": round(statistics.median(mins)),
        "longestMin": round(max(mins)),
        "hours": round(sum(mins) / 60, 1),
        "days": len({a.date() for a, _ in stays}),
        # Days of August with at least one stay (1-31), for the per-boat calendar strip.
        "dayList": sorted({a.day for a, _ in stays if a.month == 8}),
        "origins": [[f, k] for f, k in sorted(into.items(), key=lambda x: (-x[1], x[0]))[:5] if f in places],
    })
boats.sort(key=lambda r: (-r["stays"], -r["hours"], r["id"]))
from common import write_json  # noqa: E402

write_json("harbour.json", {
    "polygon": poly,
    "boats": boats,
    "entered": len(out),
    "origins": [
        {"id": f, "name": names.get(f, places[f]["name"]), "lat": places[f]["lat"], "lon": places[f]["lon"], "n": k}
        for f, k in sorted(origin_n.items(), key=lambda x: (-x[1], x[0])) if f in places
    ],
    "hours": hours,
    "days": [{"d": d, "boats": len(s)} for d, s in sorted(days.items()) if d.startswith("2025-08")],
})
