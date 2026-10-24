# Weather data: guide for backend use

This folder collects wind, rain, sea-state and sea-temperature data across the
Maldives into one SQLite file. Its purpose is to join weather to vessel movements
and travel routes, and to predict whether a boat sails.

- **Database:** `weather/data/weather.sqlite` (SQLite, WAL mode, roughly 150 MB and growing)
- **Port movements** (queue/berth history) are a separate database: `collector/data/port.sqlite`.
  See `collector/README.md`.
- **Coverage:** 1 Jan 2025 → now. Live collection runs every hour.
- **Committed snapshot** (if you aren't on this server): `weather/export/` and `collector/export/` hold
  every table as gzipped CSV, with a `MANIFEST.md` giving row counts, time ranges and the schema. Rebuild
  a SQLite file with `python3 weather/import_export.py weather/export weather.sqlite`, and the same for
  `collector/export`. The snapshot is frozen at its export time. For newer data, use the live server
  databases, or fetch from the sources (§9). Refresh the snapshot with `python3 weather/export.py`.

---

## 1. Ground rules

| Rule | Detail |
|---|---|
| **Read only** | Collectors write to these files continuously. Open them read-only (`file:...weather.sqlite?mode=ro` with `uri=True`) and never write to them. Keep your own tables in your own database. |
| **Copying** | Don't `cp` the file while it's being written. Use the SQLite backup API (`sqlite3 src.sqlite ".backup dst.sqlite"`, or `conn.backup()` in Python). |
| **Times are UTC** | Every time column is UTC. Maldives local time is **UTC+5** with no DST. Port-portal fields such as `BerthingDate` are local time. Our own timestamps are UTC. |
| **Time formats** | Hourly model data uses `YYYY-MM-DDTHH:MMZ` (e.g. `2026-10-24T07:00Z`). Fetch/issue stamps use `YYYY-MM-DDTHH:MM:SS+00:00`. Daily tables use `YYYY-MM-DD`. Compare with `substr(time,1,13)` (to the hour) or parse to datetimes. Don't string-compare mixed formats. |
| **Units** | Metric throughout: m/s, mm, hPa, °C, m, s. METAR is the exception, kept in knots as reported. |
| **Directions** | Meteorological convention: direction the wind or waves come **from**, in degrees clockwise from north (`0` = from north, `90` = from east). |
| **NULL** | NULL means missing or not provided, never zero. Exception: in `imerg_hh`, a missing cell means zero rain (see §4.4). |
| **Licence** | Open-Meteo data (`era5_*`, `marine_*`, `wx_*`, `fc_*`) is for **non-commercial** use on the free tier. For commercial use, pull ERA5 from the Copernicus CDS or buy an Open-Meteo plan. NASA IMERG and NOAA (OISST, GSOD, METAR) data are free for any use. |

---

## 2. Where the data is: points and grids

### 2.1 `points`: fixed sample points (32)

Gridded model data (wind, waves) is stored **per point**, not as a full grid.

| `role` | ids | what |
|---|---|---|
| `line` | `L01`…`L17` | Down the chain every 0.5° of latitude, from Haa Alif (7.0°N) to Addu (0.75°S) |
| `side` | `W01`…`W05`, `E01`…`E05` | One point west and one east of the wider atolls (Thiladhunmathi, Raa/Lhaviyani, Ari/Malé, Faafu–Meemu, Huvadhoo) |
| `station` | `S435330`, `S435550`, `S435770`, `S435880`, `S435990` | Hanimaadhoo, Hulhulé/Velana, Kadhdhoo, Kaadedhdhoo, Gan: the GSOD airport sites, for checking model values against observations |

Columns: `id, name, lat, lon, region (north|central|south), role`.
`grid_cell(point_id, source, grid_lat, grid_lon)` records the model cell Open-Meteo actually used
for each point and source. The models have different grids:
ERA5 0.25°, ERA5-Ocean 0.5°, Météo-France wave ≈ 0.083°.

### 2.2 Gridded boxes

Satellite rain (`imerg_*`) and sea temperature (`oisst_daily`) are stored as **every grid cell** in
a box around the chain: lat −1.0 to 7.5, lon 72.25 to 74.0.
- IMERG: 0.1°, 18 lon × 85 lat = 1,530 cells. Cell centres are at x.x5 (e.g. 72.25, 72.35).
- OISST: 0.25°, 8 lon × 35 lat = 280 cells. Cell centres are at .125/.375/.625/.875.

### 2.3 Mapping a route or island to weather

There's no route table here; routes are yours to define. Suggested approach:

1. **For point data** (wind, waves): take the route's start, end and a few waypoints. Map each to its
   nearest `points` row (haversine on `lat`/`lon`). Aggregate the worst case along the route, e.g.
   `max(wind_gusts_10m)` and `max(wave_height)` over the route's points and the departure window.
2. **For box data** (rain, SST): select cells within ~10–25 km of the route line, or snap each
   waypoint to the nearest cell. Snapping is `round((lat - 0.05) * 10) / 10 + 0.05` for IMERG.
3. Open water between atolls is what matters for small boats, so the `side` points and channel
   points (`L12` One and Half Degree Channel, `L15` Equatorial Channel) are often the most useful.

---

## 3. Choosing a table: which one answers "what was the weather at time T"

Wind and rain at a point, for hour T:

```
ERA5 (era5_hourly)        2025-01-01 ......... now − 6 days      reanalysis, best "what happened"
live (wx_recent)                       2026-10-22 ............ now   model analysis, continuous from here on
forecast (fc_hourly)      what was *predicted* for T, as known at issue time (every 3 h, up to 64 h ahead)
```

- **What happened at T:** `era5_hourly` if it has T; otherwise `wx_recent`. They're different models
  (ERA5 vs ECMWF IFS / best-match), so expect small jumps at the seam. Flag the source in your features.
- **What a skipper knew before departing:** `fc_hourly` / `marine_fc`. Pick the newest `issued_at`
  before the decision time, then read the rows whose `time` covers the trip. This is the right
  input for a "will the boat go" model, because the actual weather isn't known when the decision is made.
- **Rain:** use **IMERG**, not model `precipitation`. Reanalysis rain is weak in the tropics:
  too much light drizzle and too little heavy convective rain.

Waves at a point, for hour T:

```
mf_wave (marine_hourly, model='meteofrance_wave')   2025-01-01 ... now − 6 days   total + wind-wave + swell
era5_ocean (marine_hourly, model='era5_ocean')      2025-01-01 ... now − 6 days   total only, coarse 0.5°
live (marine_recent)                                 2026-10-22 ... now           same Météo-France model, so seamless with mf_wave
```

Prefer `meteofrance_wave` + `marine_recent`. Use `era5_ocean` as a cross-check.

---

## 4. Tables

### 4.1 Archive (2025-01-01 → now − ~6 days), topped up daily at 06:30

**`era5_hourly`**: ERA5 reanalysis via Open-Meteo. PK `(point_id, time)`.

| column | unit | notes |
|---|---|---|
| `wind_speed_10m` | m/s | mean wind at 10 m |
| `wind_direction_10m` | ° from | |
| `wind_gusts_10m` | m/s | |
| `precipitation` | mm (in the hour) | weak in the tropics, prefer IMERG |
| `pressure_msl` | hPa | |
| `temperature_2m` | °C | |

**`marine_hourly`**: waves via the Open-Meteo Marine API. PK `(point_id, model, time)`.
`model` is `meteofrance_wave` (all columns) or `era5_ocean` (only `wave_*`; the split columns are NULL).

| column | unit | notes |
|---|---|---|
| `wave_height` | m | significant height of the total sea |
| `wave_direction` / `wave_period` | ° from / s | |
| `wind_wave_height` / `_direction` / `_period` | m / ° / s | locally wind-generated sea (choppy, short period) |
| `swell_wave_height` / `_direction` / `_period` | m / ° / s | swell from distant storms (long period) |

**`oisst_daily`**: NOAA OISST v2.1 sea surface temperature, °C. PK `(date, lat, lon)`. About 2 weeks behind.

**`gsod_daily`**: NOAA GSOD daily station observations, converted to metric. PK `(station, date)`.
**NCEI has published nothing for these stations after 2025-08-24**, so this is a check on the gridded
data, not a live feed.
Columns: `temp_c, dewp_c, slp_hpa, visib_km, wdsp_ms` (mean wind), `mxspd_ms` (max sustained),
`gust_ms, prcp_mm, prcp_flag` (NOAA flag; `I` = incomplete), `frshtt` (fog/rain/snow/hail/thunder/tornado
flags as 6 digits), `n_obs` (observations in the day).

**`imerg_daily`** + **`imerg_days`**: NASA GPM IMERG daily rain total (mm), every cell in the box.
`imerg_days.run` says which product each date came from:
`F` Final (best, about 3.5 months behind), `L` Late (about 1.5 days), `E` Early (about 1 day).
Dates are **upgraded in place** when a better run appears, so a value from E or L can change later.
Use `F` when you want stable training labels. Dates are UTC days.

### 4.2 Live (polled every hour at :05)

**`wx_current`**: current conditions per point at each poll (Open-Meteo best-match, 15-min data).
Extra columns: `cloud_cover` (%) and `weather_code` (WMO code: 0 clear, 1–3 cloud, 51–67 drizzle/rain,
80–82 showers, 95–99 thunderstorm).

**`wx_recent`** / **`marine_recent`**: hourly values for the last 48 h, upserted every hour (newest
estimate wins). Rows are never deleted, so together they form a continuous hourly series from the
moment collection started. `updated_at` is when the row was last overwritten.

**`fc_hourly`** / **`marine_fc`**: forecasts **as issued**, saved every 3 h
(issue hours 00, 03, … 21 UTC). PK `(issued_at, point_id, time)`; `lead_h` = hours ahead (1–64).
Wind is from ECMWF IFS 0.25°; waves are from Météo-France.

**`metar`**: airport observations, every report, as published.
Only **VRMM** (Velana), **VRMH** (Hanimaadhoo) and **VRMG** (Gan) send reports to NOAA's feed.
Columns: `wdir` (text; `VRB` = variable), `wspd_kt`, `wgst_kt` (knots, ×0.5144 for m/s),
`visib` (text, e.g. `6+` statute miles), `temp_c`, `dewp_c`, `altim_hpa`, `wx_string`
(e.g. `TSRA` = thunderstorm with rain, `SHRA` = showers), `cover`, `raw` (full METAR).

### 4.3 Satellite rain, live

**`imerg_hh`** + **`imerg_hh_files`**: NASA IMERG **Early** half-hourly rain rate, **mm/hr**, about 5 h behind.
`time` is the start of the 30-minute slot. Multiply by 0.5 for mm in that slot.

### 4.4 Sparse storage in `imerg_hh` (important)

Only cells with rain > 0 are stored. A slot listed in `imerg_hh_files` that has **no row** for a cell
means **0 mm/hr** there. A slot **missing from `imerg_hh_files`** means it hasn't been fetched yet, so
the value is unknown, not zero.

```sql
-- rain (mm) per half-hour at the cell nearest Malé, zeros filled in
SELECT f.time, COALESCE(h.precip_mmhr, 0) * 0.5 AS mm
FROM imerg_hh_files f
LEFT JOIN imerg_hh h ON h.time = f.time AND h.lat = 4.15 AND h.lon = 73.55
ORDER BY f.time;
```

### 4.5 Bookkeeping (you can ignore these)

- `fetch_log`: which archive chunks are done.
- `live_polls`: one row per live poll per source (`ok`, `rows`, `error`). Use it to find gaps.
- `job_state`: status of the archive jobs, plus the Earthdata token expiry (`earthdata_token.next_at`).

---

## 5. Example queries

```sql
-- Hourly wind + waves at one point for a date range: best available source per hour
WITH w AS (
  SELECT time, wind_speed_10m, wind_gusts_10m, wind_direction_10m, 'era5' AS src
  FROM era5_hourly WHERE point_id = 'L12'
  UNION ALL
  SELECT r.time, r.wind_speed_10m, r.wind_gusts_10m, r.wind_direction_10m, 'live'
  FROM wx_recent r WHERE r.point_id = 'L12'
    AND NOT EXISTS (SELECT 1 FROM era5_hourly e WHERE e.point_id = r.point_id AND e.time = r.time)
),
s AS (
  SELECT time, wave_height, swell_wave_height, swell_wave_period FROM marine_hourly
  WHERE point_id = 'L12' AND model = 'meteofrance_wave'
  UNION ALL
  SELECT r.time, r.wave_height, r.swell_wave_height, r.swell_wave_period FROM marine_recent r
  WHERE r.point_id = 'L12' AND NOT EXISTS (SELECT 1 FROM marine_hourly m
        WHERE m.point_id = r.point_id AND m.model = 'meteofrance_wave' AND m.time = r.time)
)
SELECT w.time, w.src, w.wind_speed_10m, w.wind_gusts_10m, s.wave_height, s.swell_wave_height
FROM w LEFT JOIN s USING (time)
WHERE w.time BETWEEN '2026-10-01T00:00Z' AND '2026-10-24T23:00Z'
ORDER BY w.time;

-- What the forecast said, at the last issue before a decision time, for the next 12 h
SELECT f.time, f.lead_h, f.wind_gusts_10m, m.wave_height
FROM fc_hourly f
JOIN marine_fc m ON m.issued_at = f.issued_at AND m.point_id = f.point_id AND m.time = f.time
WHERE f.point_id = 'L06'
  AND f.issued_at = (SELECT max(issued_at) FROM fc_hourly WHERE issued_at <= '2026-10-25T01:00:00+00:00')
  AND f.lead_h <= 12
ORDER BY f.time;

-- Daily rain over the central atolls (box average), with which IMERG run it came from
SELECT d.date, k.run, round(avg(d.precip_mm), 1) AS mean_mm, max(d.precip_mm) AS max_mm
FROM imerg_daily d JOIN imerg_days k USING (date)
WHERE d.lat BETWEEN 3.0 AND 5.0 AND d.lon BETWEEN 72.7 AND 73.8
GROUP BY d.date ORDER BY d.date;

-- Sanity check: ERA5 wind vs GSOD at Hulhulé (daily means)
SELECT g.date, g.wdsp_ms AS observed, round(avg(e.wind_speed_10m), 2) AS era5
FROM gsod_daily g
JOIN era5_hourly e ON e.point_id = g.point_id AND substr(e.time, 1, 10) = g.date
WHERE g.station = '43555099999'
GROUP BY g.date ORDER BY g.date;
```

Python, read-only:

```python
import sqlite3
con = sqlite3.connect("file:/home/crundi/projects/maasinga/weather/data/weather.sqlite?mode=ro", uri=True, timeout=30)
rows = con.execute("SELECT * FROM points").fetchall()
```

---

## 6. Joining with port movements

`collector/data/port.sqlite` (polled every 2 min) gives the vessel side:

- `event`: `queue_join`, `queue_leave`, `queue_move`, `status_change`, `given_change`,
  `zone_enter`, `zone_leave`, each with `ts` (UTC), vessel `reg_no` / `name`, and `queue` / `zone`.
  A **`zone_leave` with `new_value` NULL** means the vessel left the harbour, i.e. a departure.
- `movement`: per-vessel `berthing_date` (local time, UTC+5) for when it entered its current zone.

To build a "did it sail" dataset:

1. Collect departures from `event`.
2. Attach each vessel's route, from your travel-route data.
3. Read the weather for that route from the tables above, at the departure time and in the window
   before it. Use `fc_hourly` / `marine_fc` for what was forecast and `wx_recent` / `imerg_hh` for what
   happened.
4. Negative examples are vessels that would normally sail on that day or route but stayed berthed.

Remember to convert port-portal local times (UTC+5) before joining.

---

## 7. Freshness and known limits

| Source | Lag | Notes |
|---|---|---|
| ERA5 wind (`era5_hourly`) | ~5–6 days | the daily top-up fills new days; use `wx_recent` for the gap |
| Waves (`marine_hourly`) | ~5–6 days | same |
| Live model (`wx_*`, `marine_*`, `fc_*`) | minutes | hourly at :05 |
| METAR | ~1 h | 3 airports only; occasional 504s from NOAA, retried next hour |
| IMERG half-hourly | ~5 h | |
| IMERG daily | 1 day (E) → 1.5 days (L) → ~3.5 months (F) | values can change on upgrade |
| OISST | ~2 weeks | |
| GSOD | ended 2025-08-24 | no newer data published |

- **ERA5-Ocean on Open-Meteo has no swell/wind-wave split.** The split comes from Météo-France only.
- **NASA token expiry:** the Earthdata token in `~/.config/earthdata/token` expires **2026-12-23**.
  After that IMERG stops updating, and `live_polls` / `job_state` show 401 errors, until a new token
  is saved to that file.
- **Gaps:** if a collector was down, `live_polls` (live) and the port DB's `polls` table show it.
  Treat missing hours as missing; don't interpolate silently.

## 8. What runs where

| Crundi service | Script | Does |
|---|---|---|
| `weather-live` | `live.py` (venv python) | hourly current, recent, forecast snapshots, METAR, IMERG half-hourly |
| `weather-backfill` | `fetch_openmeteo.py`, `fetch_obs.py` | ERA5 wind, waves, OISST, GSOD archive (daily schedule 06:30) |
| `imerg-backfill` | `fetch_imerg.py archive` | IMERG daily archive + run upgrades (daily schedule 06:45) |
| `port-collector` | `collector/collect.py` | port queue and berth snapshots, every 2 min |

Point definitions are in `points.py`; table definitions are in `db.py`, `live.py` and `fetch_imerg.py`.

---

## 9. How we collect it, and how to retrieve it from the sources

Every table here comes from a public source. This is how we collect each one now; 9.1–9.8 below
give the exact requests, so you can pull the same data yourself.

| Source | Collected by | When | Into tables |
|---|---|---|---|
| Open-Meteo Forecast API (9.1) | `live.py` | hourly at :05; forecast snapshot kept every 3 h | `wx_current`, `wx_recent`, `fc_hourly` |
| Open-Meteo Marine API (9.2) | `live.py` (live), `fetch_openmeteo.py` (history) | hourly; history daily at 06:30 | `marine_current`, `marine_recent`, `marine_fc`, `marine_hourly` |
| Open-Meteo Historical / ERA5 (9.3) | `fetch_openmeteo.py` | daily at 06:30 (fills up to now − 6 days) | `era5_hourly`, `grid_cell` |
| NASA GPM IMERG (9.4) | `live.py` (half-hourly), `fetch_imerg.py archive` (daily) | hourly; archive daily at 06:45 | `imerg_hh`, `imerg_hh_files`, `imerg_daily`, `imerg_days` |
| NOAA METAR (9.5) | `live.py` | hourly | `metar` |
| NOAA OISST (9.6) | `fetch_obs.py` | daily at 06:30 | `oisst_daily` |
| NOAA GSOD (9.7) | `fetch_obs.py` | daily at 06:30 (no new data since 2025-08) | `gsod_daily` |
| local.port.mv (9.8) | `collector/collect.py` | every 2 min | port DB: `queue_listing`, `berth`, `movement`, `event` |

The points requested are the 32 in `points.py` (§2.1), sent as comma-separated lists. Everything
is requested and stored in UTC.

### 9.1 Wind, rain (model) and current conditions: Open-Meteo Forecast API

No key. Several points in one call: comma-separated `latitude` and `longitude` lists, and the
response is a JSON array with one object per point, in the same order.

```bash
# current conditions + last 48 h + next 3 days, hourly, ECMWF IFS 0.25 deg
curl "https://api.open-meteo.com/v1/forecast?\
latitude=4.5,1.5&longitude=73.5,73.25&\
hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,pressure_msl,temperature_2m&\
models=ecmwf_ifs025&past_days=2&forecast_days=3&wind_speed_unit=ms&timezone=GMT"

# current conditions only (15-min data, best-match model)
curl "https://api.open-meteo.com/v1/forecast?latitude=4.5&longitude=73.5&\
current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,weather_code&\
wind_speed_unit=ms&timezone=GMT"
```

Response: `hourly.time[]` (`2026-10-24T07:00`, UTC because of `timezone=GMT`) plus one array per variable.
Hours before now are model analysis (≈ what happened); hours after now are forecast.
**To record "what was forecast"**, store each response with the time you fetched it. That's what
`fc_hourly.issued_at` is. ECMWF updates every 6 h, so polling every 1–3 h is enough.

### 9.2 Waves and swell: Open-Meteo Marine API

```bash
curl "https://marine-api.open-meteo.com/v1/marine?\
latitude=4.5,1.5&longitude=73.5,73.25&\
current=wave_height,swell_wave_height&\
hourly=wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period&\
models=meteofrance_wave&past_days=2&forecast_days=3&timezone=GMT"
```

Same response shape as 9.1. Model `meteofrance_wave` has the swell/wind-wave split.

### 9.3 History for the same points: Open-Meteo Historical (ERA5)

```bash
curl "https://archive-api.open-meteo.com/v1/archive?latitude=4.5&longitude=73.5&\
start_date=2026-10-01&end_date=2026-10-18&\
hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,pressure_msl,temperature_2m&\
models=era5&wind_speed_unit=ms&timezone=GMT"
# waves history: marine-api URL above with start_date/end_date and models=meteofrance_wave (from 2021-10) or era5_ocean
```

ERA5 is about 5 days behind. Fill the last few days from 9.1's `past_days`.

**Open-Meteo limits (free tier):** non-commercial use only. 600 calls/min, 5,000/hour, 10,000/day,
where one call = 1 location × ≤10 variables × ≤2 weeks (more of any of these counts as several calls).
On `429` the body says which limit was hit; back off for a minute, an hour or a day accordingly.
For commercial use, get an API key plan (`customer-api.open-meteo.com` + `&apikey=`).

### 9.4 Satellite rain: NASA GPM IMERG

Needs an **Earthdata Login bearer token** (free; urs.earthdata.nasa.gov → Generate Token; valid 60 days),
with the "NASA GESDISC DATA ARCHIVE" application approved in the profile.
Send it as `Authorization: Bearer <token>`.

| product | latency | directory |
|---|---|---|
| Early, half-hourly (live) | ~4–6 h | `https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07/<YYYY>/<DOY>/` |
| Early, daily | ~1 day | `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGDE.07/<YYYY>/<MM>/` |
| Late, daily | ~1.5 days | `.../GPM_3IMERGDL.07/<YYYY>/<MM>/` |
| Final, daily | ~3.5 months | `.../GPM_3IMERGDF.07/<YYYY>/<MM>/` |

1. **List the directory** (an HTML index) to get exact file names. Don't build them by hand: the version
   suffix (`V07B`, `V07C`) and the minute-of-day field in half-hourly names vary.
   Half-hourly example: `3B-HHR-E.MS.MRG.3IMERG.20261024-S023000-E025959.0150.V07C.HDF5`
   (slot starting 02:30 UTC).
2. **Download** the file (HDF5/NetCDF4; daily ~29 MB, half-hourly ~7 MB). `data.gesdisc` redirects to
   S3. Follow redirects but keep the header for the first hop.
3. **Read** `precipitation` with h5py or netCDF4. Shape is `[time=1][lon=3600][lat=1800]` (note:
   **lon before lat**). Daily files have it at the root (mm/day); half-hourly ones in group `Grid`
   (mm/hr). `lon = -179.95 + 0.1·i`, `lat = -89.95 + 0.1·j`. The Maldives box is
   `i = 2522..2539`, `j = 890..974`. Negative values are fill (missing).

```python
import h5py
with h5py.File(path) as h:
    g = h["Grid"] if "Grid" in h else h
    box = g["precipitation"][0, 2522:2540, 890:975]   # [lon, lat]
```

Gotchas seen here:
- GES DISC's OPeNDAP subsetting (`/opendap/...ascii?precipitation[...]`) would avoid the download,
  but it was returning 503s. Whole-file download is the reliable path.
- **IPv6 from some hosts hangs** on NASA/NOAA servers. Force IPv4 if requests stall at connect.
- The `gpm1` host is slower (~20–50 s per half-hourly file). The `data.gesdisc` host serves daily files
  in ~5 s. Parallel downloads (we use 8) are fine.

### 9.5 Airport observations: NOAA Aviation Weather (METAR)

No key.

```bash
curl "https://aviationweather.gov/api/data/metar?ids=VRMM,VRMH,VRMG&format=json&hours=3"
```

Returns a JSON array: `icaoId`, `obsTime` (unix seconds), `wdir`, `wspd`/`wgst` (knots), `visib`,
`temp`, `dewp`, `altim` (hPa), `wxString`, `rawOb`. Reports come hourly (half-hourly at VRMM).
Expect occasional 504s; retry.

### 9.6 Sea surface temperature: NOAA OISST via ERDDAP

No key. Daily, about 2 weeks behind.

```bash
curl "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.csv?\
sst%5B(2026-10-01T12:00:00Z):1:(last)%5D%5B(0.0)%5D%5B(-1.0):1:(7.5)%5D%5B(72.25):1:(74.0)%5D"
```

CSV with two header rows (names, units): `time, zlev, latitude, longitude, sst`.

### 9.7 Station history: NOAA GSOD

No key. One CSV per station per year:
`https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/<YEAR>/<STATION>.csv`
(stations `43533099999`, `43555099999`, `43577099999`, `43588099999`, `43599099999`).
Imperial units with sentinels (`9999.9`, `999.9`, `99.99` = missing). For these stations nothing has
been published since 2025-08-24.

### 9.8 Port queue and berths: local.port.mv

No key, public JSON, used by the port's own web pages (which poll every 30 s):

| URL | returns |
|---|---|
| `https://local.port.mv/api/portal/vessel-queue` | queues → listings in order (position = index + 1), `status_name`, `given_zone`, `given_position`, `held_at`, vessel size |
| `https://local.port.mv/api/portal/vessels-berthed` | zones → vessels berthed, `order` along the quay |
| `https://local.port.mv/api/portal/mnh-movements` | per vessel: `BerthingDate` (local UTC+5), `Quay`, `ExpectedDeparture` (rarely set) |

There's no history in this API. Departures and arrivals are only known by comparing successive
snapshots, which is what `collector/collect.py` does (every 2 min).
