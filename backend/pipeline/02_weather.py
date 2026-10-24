"""Step 2: weather, waves and rain for August 2025, per sea region.

Source: the team's weather collector (weather/ at the repo root), committed export in weather/export:
- wind gusts: ERA5 reanalysis via Open-Meteo (era5_hourly), 27 points down and beside the atoll chain
- waves: ERA5-Ocean via Open-Meteo Marine (marine_hourly, model era5_ocean), same points
- rain: NASA GPM IMERG daily rain (imerg_daily), 0.1 degree cells
For each region we take the worst value over its points each hour (open water is what matters for
small boats; see weather/DATA_GUIDE.md section 2.3), and the mean IMERG rain over the region's cells.
Times are converted from UTC to Maldives time (UTC+5).

Output: pipeline/reference/weather/<region>.json (committed, so later runs need neither the
export nor the internet). If the export is not there, the committed files are used as they are.
"""
import json
import sys
from pathlib import Path

from common import REF, ROOT, db

# Regions by latitude band; lat/lon is the point used for the live forecast on Plan a trip.
REGIONS = {
    "north": {"name": "North", "lat": 6.3, "lon": 73.1, "band": [5.5, 8.0]},
    "central": {"name": "Male and Ari", "lat": 4.2, "lon": 73.6, "band": [3.5, 5.5]},
    "midsouth": {"name": "Mid south", "lat": 2.8, "lon": 73.2, "band": [1.8, 3.5]},
    "south": {"name": "Huvadhu and Addu", "lat": 0.5, "lon": 73.3, "band": [-1.0, 1.8]},
}

DIR = REF / "weather"
EXPORT = ROOT.parent / "weather" / "export"
MS_TO_KN = 1.943844

if __name__ == "__main__":
    DIR.mkdir(parents=True, exist_ok=True)
    if not (EXPORT / "era5_hourly.csv.gz").exists():
        print(f"no export at {EXPORT}; using the committed files in {DIR}")
        sys.exit(0)

    con = db()
    band = " ".join(f"when lat >= {r['band'][0]} and lat < {r['band'][1]} then '{k}'" for k, r in REGIONS.items())
    # Sea points only (the chain line and both sides), not the airport stations.
    con.execute(f"create table pts as select id point_id, case {band} end region from read_csv('{EXPORT / 'points.csv.gz'}') where role in ('line', 'side')")
    # Local time window: 1 Aug 00:00 to 31 Aug 23:00 Maldives time = 31 Jul 19:00 to 31 Aug 18:00 UTC.
    window = "time >= '2025-07-31T19:00Z' and time <= '2025-08-31T18:00Z'"
    con.execute(f"""
    create table gust as
    select p.region, strftime(strptime(e.time, '%Y-%m-%dT%H:%MZ') + interval 5 hour, '%Y-%m-%dT%H:%M') t,
      max(e.wind_gusts_10m) * {MS_TO_KN} gust
    from read_csv('{EXPORT / 'era5_hourly.csv.gz'}', types={{'time': 'VARCHAR'}}) e join pts p using (point_id)
    where {window} group by 1, 2
    """)
    con.execute(f"""
    create table wave as
    select p.region, strftime(strptime(m.time, '%Y-%m-%dT%H:%MZ') + interval 5 hour, '%Y-%m-%dT%H:%M') t, max(m.wave_height) wave
    from read_csv('{EXPORT / 'marine_hourly.csv.gz'}', types={{'time': 'VARCHAR'}}) m join pts p using (point_id)
    where m.model = 'era5_ocean' and {window} group by 1, 2
    """)
    # IMERG daily rain (UTC days): mean over cells in the region's band, inside the atoll chain's longitudes.
    con.execute(f"""
    create table rain as
    select case {band} end region, date::varchar d, avg(precip_mm) rain, max(precip_mm) rain_max
    from read_csv('{EXPORT / 'imerg_daily.csv.gz'}', types={{'date': 'VARCHAR'}})
    where date between '2025-08-01' and '2025-08-31' and lon between 72.6 and 73.8
    group by 1, 2
    """)

    pts = {}
    for k, la, lo in con.execute(f"select case {band} end, lat, lon from read_csv('{EXPORT / 'points.csv.gz'}') where role in ('line', 'side') order by id").fetchall():
        pts.setdefault(k, []).append([la, lo])

    for key, r in REGIONS.items():
        hours = con.execute("""
        select w.t, round(w.wave, 2), round(g.gust, 1) from wave w join gust g using (region, t)
        where w.region = ? order by w.t""", [key]).fetchall()
        days = con.execute("""
        select substr(w.t, 1, 10) d, round(max(w.wave), 2), round(max(g.gust), 1),
          round(any_value(rn.rain), 1), round(any_value(rn.rain_max), 1)
        from wave w join gust g using (region, t) left join rain rn on rn.region = w.region and rn.d = substr(w.t, 1, 10)
        where w.region = ? group by 1 order by 1""", [key]).fetchall()
        out = {
            "region": key, **r,
            "points": pts.get(key, []),
            "source": "team weather export: ERA5 gusts and ERA5-Ocean waves (Open-Meteo), NASA GPM IMERG rain",
            "marine": {
                "hourly": {"time": [h[0] for h in hours], "wave_height": [h[1] for h in hours]},
                "daily": {"time": [d[0] for d in days], "wave_height_max": [d[1] for d in days]},
            },
            "weather": {
                "hourly": {"time": [h[0] for h in hours], "wind_gusts_10m": [h[2] for h in hours]},
                "daily": {"time": [d[0] for d in days], "wind_gusts_10m_max": [d[2] for d in days],
                          "precipitation_sum": [d[3] for d in days], "precipitation_max_cell": [d[4] for d in days]},
            },
        }
        with open(DIR / f"{key}.json", "w") as f:
            json.dump(out, f)
        print(f"{key}: {len(hours)} hours, {len(days)} days")
