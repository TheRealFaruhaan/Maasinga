"""Step 5: routes, timetables and the Travel Index.

Route: all trips from one place to another (direction matters).
Usual departures: 15-minute slots in which the route had a departure on at least 30% of the 31 days.
Travel Index: boat departures per week per 1,000 residents (Census 2022), per inhabited island.
Only boats that carry a FollowMe tracker are counted, so the index is relative, not a full count.

Output: data/out/network.json
"""
import json

from common import OUT, REF, WORK, db, write_json

DAYS = 31
USUAL_SHARE = 0.30
MIN_ROUTE_TRIPS = 20  # routes with fewer trips in August are not listed
HUBS = {"MLE.Hulhule"}  # the airport island: a transfer hub, not a residential island

con = db()
con.execute(f"create table isl as select * from read_csv('{REF / 'islands.csv'}')")
con.execute(f"create table tr as select * from '{WORK / 'trips.parquet'}'")
con.execute(f"create table pl as select * from '{WORK / 'places.parquet'}'")

# Name sites after the nearest resort from OpenStreetMap when one is within 1.5 km.
resorts_path = OUT / "resorts.json"
resorts = json.load(open(resorts_path)) if resorts_path.exists() else []
con.execute("create table rs(name varchar, lat double, lon double)")
if resorts:
    con.executemany("insert into rs values (?,?,?)", resorts)
# Industrial islands near Male have no census row and no resort tag; name them by hand (OpenStreetMap positions).
con.executemany("insert into rs values (?,?,?)", [("Thilafushi", 4.1835, 73.4461), ("Gulhifalhu", 4.1660, 73.4560)])
con.execute("""
create table site_names as
select p.place, arg_min(r.name, d.km) name, min(d.km) km
from pl p cross join rs r,
lateral (select 111.2 * sqrt(pow(p.lat - r.lat, 2) + pow((p.lon - r.lon) * cos(radians(p.lat)), 2)) km) d
where p.kind = 'site' group by 1 having min(d.km) <= 1.5
""")

places = con.execute("""
select p.place, p.kind, round(p.lat, 4), round(p.lon, 4), p.boats,
  coalesce(i.island, sn.name, 'Unnamed site') name, i.atoll, i.population_2022
from pl p left join isl i on i.island_code = p.place left join site_names sn using (place)
""").fetchall()
# OSM names in capitals ("OBLU XPERIENCE AILAFUSHI") are set in title case for display.
places = [(p, k, la, lo, b, n.title() if n.isupper() else n, a, pop) for p, k, la, lo, b, n, a, pop in places]

# Most common boat type per route; a tie goes to the faster type name in alphabetical order, so runs agree.
con.execute("""
create table route_cls as
select from_place, to_place, arg_max(cls, (c, cls)) cls from (
  select from_place, to_place, cls, count(*) c from tr group by 1, 2, 3) group by 1, 2
""")
routes = con.execute(f"""
select from_place, to_place, count(*) n, count(distinct imei) boats,
  round(median(minutes)) mins,
  round(100.0 * sum(late) / nullif(sum(pings), 0), 1) late_pct,
  any_value(rc.cls) cls
from tr join route_cls rc using (from_place, to_place) group by 1, 2 having count(*) >= {MIN_ROUTE_TRIPS}
""").fetchall()

# Usual departures per route: 15-minute slots used on 30% or more of days.
slots = con.execute(f"""
with s as (
  select from_place, to_place, strftime(time_bucket(interval 15 minute, dep), '%H:%M') slot,
    count(distinct dep::date) as n_days
  from tr group by 1, 2, 3
)
select from_place, to_place, list([slot, n_days::varchar] order by slot) from s
where n_days >= {DAYS * USUAL_SHARE} group by 1, 2
""").fetchall()
# Each usual departure keeps the number of August days it ran on, e.g. ["09:00", 24].
slot_map = {(a, b): [[t, int(d)] for t, d in s] for a, b, s in slots}

# Departures by hour of day per route (for the small chart on the route card).
hour_map = {}
for a, b, h, n in con.execute("select from_place, to_place, hour(dep), count(*) from tr group by 1, 2, 3").fetchall():
    hour_map.setdefault((a, b), [0] * 24)[h] = n

# Typical path per route: the GPS track of the trip whose duration is closest to the route median,
# one point per minute, as integers (degrees x 10,000).
con.execute(f"""
create table pick as
with r as (select from_place, to_place, median(minutes) med from tr group by 1, 2 having count(*) >= {MIN_ROUTE_TRIPS})
select tr.from_place, tr.to_place, arg_min(tr.imei, (abs(tr.minutes - r.med), tr.dep, tr.imei)) imei,
  arg_min(tr.dep, (abs(tr.minutes - r.med), tr.dep, tr.imei)) dep,
  arg_min(tr.arr, (abs(tr.minutes - r.med), tr.dep, tr.imei)) arr
from tr join r using (from_place, to_place) group by 1, 2
""")
paths = {}
for a, b, lon, lat in con.execute(f"""
select pk.from_place, pk.to_place, round(arg_max(p.lon, p.t) * 10000)::int, round(arg_max(p.lat, p.t) * 10000)::int
from pick pk join '{WORK / 'pings.parquet'}' p on p.imei = pk.imei and p.t between pk.dep and pk.arr
group by pk.from_place, pk.to_place, time_bucket(interval 1 minute, p.t)
order by pk.from_place, pk.to_place, time_bucket(interval 1 minute, p.t)
""").fetchall():
    paths.setdefault(f"{a}|{b}", []).extend([lon, lat])
write_json("paths.json", paths)

# Boats on each route: coded ID (same 6-character code as the safety and harbour pages), type,
# trips on the route, typical trip time and the last day seen. No tracker IMEI leaves the pipeline.
route_boats = {}
for a, b, code, cls, n, mins, last in con.execute(f"""
select tr.from_place, tr.to_place, upper(substr(md5(tr.imei), 1, 6)), any_value(tr.cls), count(*), round(median(tr.minutes)),
  strftime(max(tr.dep), '%Y-%m-%d')
from tr join (select from_place, to_place from tr group by 1, 2 having count(*) >= {MIN_ROUTE_TRIPS}) r using (from_place, to_place)
group by tr.from_place, tr.to_place, tr.imei
order by 1, 2, 5 desc, 3
""").fetchall():
    route_boats.setdefault(f"{a}|{b}", []).append([code, cls, n, int(mins), last])
write_json("route-boats.json", route_boats)

# Travel Index per inhabited island (hubs excluded).
index_rows = con.execute(f"""
select i.island_code, i.island, i.atoll, i.population_2022,
  count(tr.dep) departures, count(distinct tr.imei) boats, count(distinct tr.to_place) destinations
from isl i left join tr on tr.from_place = i.island_code
group by 1, 2, 3, 4
order by 1
""").fetchall()
# Census localities that share one island point (S.Hulhudhoo and S.Meedhoo on Hulhumeedhoo) are
# merged: stops can only be matched to one of them, so apart they would read as 0 and full.
coords = {c: (la, lo) for c, la, lo in con.execute("select island_code, lat, lon from isl").fetchall()}
merged = {}
for code, island, atoll, pop, dep, boats, dests in index_rows:
    key = coords[code]
    if key in merged:
        m = merged[key]
        m[0] = m[0] if dep <= m[4] else code
        m[1] = f"{m[1]} and {island}"
        m[3] += pop
        m[4], m[5], m[6] = m[4] + dep, max(m[5], boats), max(m[6], dests)
    else:
        merged[key] = [code, island, atoll, pop, dep, boats, dests]
index = []
for code, island, atoll, pop, dep, boats, dests in merged.values():
    if code in HUBS:
        continue
    per_week = dep / DAYS * 7
    index.append({
        "code": code, "island": island, "atoll": atoll, "pop": pop,
        "depWeek": round(per_week, 1), "boats": boats, "dests": dests,
        "index": round(per_week / pop * 1000, 1),
    })
index.sort(key=lambda r: r["index"])

# Daily departures per island over August, to show weather days (only islands with routes).
daily = con.execute("""
select dep::date::varchar d, count(*) n, count(*) filter (where from_place like '%.%' and to_place like '%.%') public_n
from tr group by 1 order by 1
""").fetchall()

write_json("network.json", {
    "places": [
        {"id": p, "kind": k, "lat": la, "lon": lo, "boats": b, "name": n, "atoll": a, "pop": pop}
        for p, k, la, lo, b, n, a, pop in places
    ],
    "routes": [
        {"from": a, "to": b, "n": n, "boats": bo, "mins": m, "latePct": lp, "cls": c,
         "usual": slot_map.get((a, b), []), "hours": hour_map.get((a, b), [])}
        for a, b, n, bo, m, lp, c in routes
    ],
    "index": index,
    "daily": [{"d": d, "n": n, "islands": p} for d, n, p in daily],
    "totals": {
        "trips": con.execute("select count(*) from tr").fetchone()[0],
        "boats": con.execute("select count(distinct imei) from tr").fetchone()[0],
        "days": DAYS,
        "population": con.execute("select sum(population_2022) from isl").fetchone()[0],
    },
})
print("routes", len(routes), "places", len(places), "islands in index", len(index))
print("least served", [(r["island"], r["index"]) for r in index[:5]])
