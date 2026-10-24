"""Step 3: the fleet as a sea-state sensor.

Method: each speedboat has its own normal cruising speed (its monthly median when moving over 15 kn).
The Sea Pace Index for a region and hour = average of (speed / that boat's normal speed) over all
speedboats moving there. 1.00 = boats run at their normal speed; 0.90 = 10% slower.
We compare it with Open-Meteo wave height for the same region and hour.

Output: dashboard/public/data/sea.json
"""
import json
from importlib import import_module

from common import PINGS, REF, db, write_json

REGIONS = import_module("02_weather").REGIONS
MIN_BOATS = 3  # an hour needs at least this many moving speedboats to count

con = db()

# Hourly and daily weather per region.
rows_h, rows_d = [], []
for key in REGIONS:
    w = json.load(open(REF / "weather" / f"{key}.json"))
    mh, wh = w["marine"]["hourly"], w["weather"]["hourly"]
    for t, wave, gust in zip(mh["time"], mh["wave_height"], wh["wind_gusts_10m"]):
        rows_h.append((key, t, wave, gust))
    md, wd = w["marine"]["daily"], w["weather"]["daily"]
    for d, wave, gust, rain in zip(md["time"], md["wave_height_max"], wd["wind_gusts_10m_max"], wd["precipitation_sum"]):
        rows_d.append((key, d, wave, gust, rain))
con.execute("create table wh(region varchar, t timestamp, wave double, gust double)")
con.executemany("insert into wh values (?, strptime(?, '%Y-%m-%dT%H:%M'), ?, ?)", rows_h)
con.execute("create table wd(region varchar, d date, wave double, gust double, rain double)")
con.executemany("insert into wd values (?, ?::date, ?, ?, ?)", rows_d)

band = " ".join(f"when lat >= {r['band'][0]} and lat < {r['band'][1]} then '{k}'" for k, r in REGIONS.items())

# Each speedboat's normal cruising speed, then the hourly index per region.
con.execute(f"create table norm as select imei, median(kn) normal from '{PINGS}' where cls='fast' and kn>15 group by 1")
con.execute(f"""
create table hourly as
select case {band} end region, date_trunc('hour', t) t,
  avg(kn / normal) idx, avg(kn) kn, count(distinct imei) boats
from '{PINGS}' join norm using (imei)
where cls='fast' and kn > 15
group by 1, 2 having count(distinct imei) >= {MIN_BOATS}
""")

# Daily index = boat-weighted mean of the hourly index.
con.execute("""
create table daily as
select region, t::date d, sum(idx*boats)/sum(boats) idx, sum(kn*boats)/sum(boats) kn
from hourly group by 1, 2
""")
# Distinct speedboats moving per region per day.
con.execute(f"""
create table active as
select case {band} end region, t::date d, count(distinct imei) boats
from '{PINGS}' where cls='fast' and kn > 15 group by 1, 2
""")

fit = {}
for key, r in REGIONS.items():
    h = con.execute("""select corr(idx, wave), count(*) from hourly join wh using (region, t) where region = ?""", [key]).fetchone()
    d = con.execute("""
      select corr(idx, wave), regr_slope(idx, wave), regr_intercept(idx, wave), corr(idx, gust), count(*)
      from daily join wd using (region, d) where region = ?""", [key]).fetchone()
    fit[key] = {
        "name": r["name"], "lat": r["lat"], "lon": r["lon"],
        "points": json.load(open(REF / "weather" / f"{key}.json")).get("points", [[r["lat"], r["lon"]]]),
        "r_daily": round(d[0], 2), "slope": round(d[1], 4), "intercept": round(d[2], 4),
        "r_gust": round(d[3], 2), "days": d[4], "r_hourly": round(h[0], 2), "hours": h[1],
    }

# Pooled fit across all regions (used for the route forecast).
pooled = con.execute("""select corr(idx, wave), regr_slope(idx, wave), regr_intercept(idx, wave), count(*)
  from daily join wd using (region, d)""").fetchone()

# Rough day = daily max wave in the top quarter of August for that region.
rough = dict(con.execute("select region, quantile_cont(wave, 0.75) from wd group by 1").fetchall())

days = con.execute("""
select d::varchar, region, round(idx, 4), round(kn, 2), a.boats, wd.wave, wd.gust, wd.rain
from daily join wd using (region, d) join active a using (region, d)
order by d, region
""").fetchall()
out_days = {}
for d, region, idx, kn, boats, wave, gust, rain in days:
    out_days.setdefault(d, {"d": d, "r": {}})["r"][region] = {
        "idx": idx, "kn": kn, "boats": boats, "wave": wave, "gust": gust, "rain": rain,
        "rough": wave >= rough[region],
    }

# Map layer: per 0.1 degree cell and day, the speedboat index (where at least 3 boats passed).
cells = con.execute(f"""
select (t)::date::varchar d, round(floor(lat*10)/10 + 0.05, 2) la, round(floor(lon*10)/10 + 0.05, 2) lo,
  round(avg(kn / normal), 3) idx, count(distinct imei) boats
from '{PINGS}' join norm using (imei)
where cls='fast' and kn > 15
group by 1, 2, 3 having count(distinct imei) >= 3
""").fetchall()
cell_days = {}
for d, la, lo, idx, boats in cells:
    cell_days.setdefault(d, []).append([lo, la, idx, boats])

write_json("sea.json", {
    "sensors": con.execute("select count(*) from norm").fetchone()[0],
    "regions": fit,
    "pooled": {"r": round(pooled[0], 2), "slope": round(pooled[1], 4), "intercept": round(pooled[2], 4), "n": pooled[3]},
    "roughWave": {k: round(v, 2) for k, v in rough.items()},
    "days": list(out_days.values()),
    "cells": cell_days,
})
for k, f in fit.items():
    print(k, f)
print("pooled", pooled)
