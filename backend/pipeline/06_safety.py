"""Step 6: trips in rough weather and stops at sea.

Rough day: the region's daily max wave height is in its top quarter for August (from step 3).
Open-sea crossing: a trip between two different atolls (atoll of the nearest inhabited island).
Night trip: departure between 18:00 and 05:59 local time.
Stop at sea: a speedboat stops for 20 min to 4 h more than 3 km from any inhabited island and
more than 1 km from any busy site. These are candidates only: some may be fishing, diving or
waiting; each needs checking against Coast Guard records.

Output: data/out/safety.json
"""
import json
from importlib import import_module

from common import OUT, REF, WORK, db, write_json

REGIONS = import_module("02_weather").REGIONS
sea = json.load(open(OUT / "sea.json"))

con = db()
con.execute(f"create table isl as select * from read_csv('{REF / 'islands.csv'}')")
con.execute(f"create table tr as select * from '{WORK / 'trips.parquet'}'")
con.execute(f"create table st as select * from '{WORK / 'stops.parquet'}'")
con.execute(f"create table pl as select * from '{WORK / 'places.parquet'}'")

# Daily wave per region and the rough flag, from step 3.
rows = [(day["d"], k, v["wave"], v["gust"], v["rough"]) for day in sea["days"] for k, v in day["r"].items()]
con.execute("create table wd(d date, region varchar, wave double, gust double, rough boolean)")
con.executemany("insert into wd values (?::date, ?, ?, ?, ?)", rows)
band = " ".join(f"when {{c}} >= {r['band'][0]} and {{c}} < {r['band'][1]} then '{k}'" for k, r in REGIONS.items())

# Atoll of every place = atoll of its nearest inhabited island.
con.execute("""
create table place_atoll as
select p.place, arg_min(i.atoll, 111.2 * sqrt(pow(p.lat - i.lat, 2) + pow((p.lon - i.lon) * cos(radians(p.lat)), 2))) atoll
from pl p cross join isl i group by 1
""")
con.execute(f"""
create table trips as
select tr.*, a1.atoll from_atoll, a2.atoll to_atoll, p1.lat from_lat, p1.lon from_lon, p2.lat to_lat, p2.lon to_lon,
  case {band.format(c='p1.lat')} end region,
  a1.atoll <> a2.atoll crossing,
  (hour(dep) >= 18 or hour(dep) < 6) night
from tr
join place_atoll a1 on a1.place = tr.from_place join place_atoll a2 on a2.place = tr.to_place
join pl p1 on p1.place = tr.from_place join pl p2 on p2.place = tr.to_place
""")
con.execute("create table tw as select t.*, w.wave, w.rough from trips t join wd w on w.d = t.dep::date and w.region = t.region")

summary = con.execute("""
select rough, count(distinct dep::date) n_days, count(*) trips,
  count(*) filter (where crossing) crossings,
  count(*) filter (where crossing and night) night_crossings,
  count(*) filter (where crossing and cls = 'fast') fast_crossings
from tw group by 1 order by 1
""").fetchall()

days = con.execute("""
select dep::date::varchar d, count(*) trips, count(*) filter (where crossing) crossings,
  count(*) filter (where crossing and rough) rough_crossings, count(*) filter (where crossing and night) night_crossings
from tw group by 1 order by 1
""").fetchall()

# Crossings made in rough sea, grouped by route and region.
rough_routes = con.execute("""
select from_place, to_place, region, count(*) n, count(distinct dep::date) n_days, count(*) filter (where night) night,
  round(max(wave), 2) max_wave, any_value(from_lat), any_value(from_lon), any_value(to_lat), any_value(to_lon)
from tw where crossing and rough group by 1, 2, 3 order by n desc limit 40
""").fetchall()

# Crossings per region-day, rough against calm (a fair rate: days differ per region).
rates = con.execute("""
select w.rough, count(*) region_days, sum(coalesce(c.n, 0)) crossings, round(avg(coalesce(c.n, 0)), 1) per_day
from wd w left join (select dep::date d, region, count(*) n from tw where crossing group by 1, 2) c
  on c.d = w.d and c.region = w.region
group by 1 order by 1
""").fetchall()

# Speedboats that kept full speed in rough sea: on a rough region-day, the boat's median
# speed (moving over 15 kn) was at or above its own normal cruising speed. Boat IDs are hashed.
con.execute(f"create table norm as select imei, median(kn) normal from '{WORK / 'pings.parquet'}' where cls='fast' and kn>15 group by 1")
con.execute(f"""
create table boatday as
select p.imei, p.t::date d, case {band.format(c='p.lat')} end region,
  median(p.kn / n.normal) idx, count(*) pings
from '{WORK / 'pings.parquet'}' p join norm n using (imei)
where p.cls = 'fast' and p.kn > 15 group by 1, 2, 3 having count(*) >= 60
""")
fullspeed = con.execute("""
select w.rough, count(*) boat_days, count(*) filter (where b.idx >= 1.0) full_speed,
  round(100.0 * count(*) filter (where b.idx >= 1.0) / count(*), 1) pct
from boatday b join wd w on w.d = b.d and w.region = b.region group by 1 order by 1
""").fetchall()
fullspeed_boats = con.execute("""
select upper(substr(md5(b.imei), 1, 6)) id, b.region, count(*) rough_days, round(median(b.idx), 3) idx, round(max(w.wave), 2) max_wave
from boatday b join wd w on w.d = b.d and w.region = b.region
where w.rough and b.idx >= 1.0 group by 1, 2 order by rough_days desc, idx desc limit 25
""").fetchall()

# Stops at sea.
con.execute("""
create table seastops as
select s.*, case when (hour(s.arr) >= 18 or hour(s.arr) < 6) then true else false end night
from st s
where s.place is null and s.cls = 'fast' and s.near_km > 3 and s.minutes between 20 and 240
  and not exists (select 1 from pl p where p.kind = 'site'
    and 111.2 * sqrt(pow(s.lat - p.lat, 2) + pow((s.lon - p.lon) * cos(radians(s.lat)), 2)) < 1)
""")
con.execute(f"""
create table ssw as select s.*, w.wave, w.rough from seastops s
join wd w on w.d = s.arr::date and w.region = case {band.format(c='s.lat')} end
""")
stop_days = con.execute("""
select arr::date::varchar d, count(*) n, count(*) filter (where night) night from ssw group by 1 order by 1
""").fetchall()
stop_split = con.execute("""
select rough, count(distinct arr::date) n_days, count(*) n, round(count(*) / count(distinct arr::date), 1) per_day
from ssw group by 1 order by 1
""").fetchall()
stop_corr = con.execute("""
select corr(n, wave) from (select arr::date d, region, count(*) n, any_value(wave) wave from (
  select ssw.*, w.region from ssw join wd w on w.d = ssw.arr::date and w.wave = ssw.wave) group by 1, 2)
""").fetchone()[0]
stops = con.execute("""
select strftime(arr, '%Y-%m-%d %H:%M') as at_time, round(lat, 4), round(lon, 4), round(minutes) mins, round(near_km, 1) km,
  near_island, wave, rough, night
from ssw order by arr
""").fetchall()

out = {
    "summary": [
        {"rough": r, "days": d, "trips": t, "crossings": c, "nightCrossings": nc, "fastCrossings": fc}
        for r, d, t, c, nc, fc in summary
    ],
    "days": [{"d": d, "trips": t, "crossings": c, "roughCrossings": rc, "nightCrossings": nc} for d, t, c, rc, nc in days],
    "roughRoutes": [
        {"from": a, "to": b, "region": rg, "n": n, "days": dd, "night": ni, "maxWave": mw, "path": [[flo, fla], [tlo, tla]]}
        for a, b, rg, n, dd, ni, mw, fla, flo, tla, tlo in rough_routes
    ],
    "crossingRates": [{"rough": r, "regionDays": rd, "crossings": c, "perDay": p} for r, rd, c, p in rates],
    "fullSpeed": {
        "split": [{"rough": r, "boatDays": bd, "fullSpeed": fs, "pct": p} for r, bd, fs, p in fullspeed],
        "boats": [{"id": i, "region": rg, "roughDays": rd, "idx": ix, "maxWave": mw} for i, rg, rd, ix, mw in fullspeed_boats],
    },
    # Stops at sea are kept as a checked negative result: they are more common on calm days,
    # so most are leisure or work stops, not breakdowns.
    "seaStops": {
        "split": [{"rough": r, "days": d, "n": n, "perDay": p} for r, d, n, p in stop_split],
        "corrWave": round(stop_corr, 2) if stop_corr is not None else None,
        "days": [{"d": d, "n": n, "night": ni} for d, n, ni in stop_days],
    },
}
write_json("safety.json", out)
print(summary)
print(rates)
print(fullspeed)
print(fullspeed_boats[:5])
print(stop_split, "corr", stop_corr, "stops", len(stops))
