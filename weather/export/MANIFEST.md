# Export of `weather/data/weather.sqlite`

Exported 2026-10-24T08:23:56+00:00 (UTC). Gzipped CSV, header row, UTF-8; empty field = NULL.
See weather/DATA_GUIDE.md for what each table means.

| table | rows | from | to | file size |
|---|---:|---|---|---:|
| `era5_hourly` | 503,808 | 2025-01-01T00:00Z | 2026-10-18T23:00Z | 5.5 MB |
| `fc_hourly` | 0 |  |  | 0.0 MB |
| `fetch_log` | 18 |  |  | 0.0 MB |
| `grid_cell` | 96 |  |  | 0.0 MB |
| `gsod_daily` | 1,180 | 2025-01-01 | 2025-08-24 | 0.0 MB |
| `imerg_daily` | 1,011,330 | 2025-01-01 | 2026-10-23 | 3.9 MB |
| `imerg_days` | 661 | 2025-01-01 | 2026-10-23 | 0.0 MB |
| `imerg_hh` | 3,276 | 2026-10-23T20:00Z | 2026-10-24T02:30Z | 0.0 MB |
| `imerg_hh_files` | 14 | 2026-10-23T20:00Z | 2026-10-24T02:30Z | 0.0 MB |
| `job_state` | 3 | 2026-10-24T08:03:51+00:00 | 2026-10-24T08:23:36+00:00 | 0.0 MB |
| `live_polls` | 18 | 2026-10-24T07:10:00+00:00 | 2026-10-24T08:05:00+00:00 | 0.0 MB |
| `marine_current` | 96 | 2026-10-24T07:00Z | 2026-10-24T08:00Z | 0.0 MB |
| `marine_fc` | 0 |  |  | 0.0 MB |
| `marine_hourly` | 1,007,616 | 2025-01-01T00:00Z | 2026-10-18T23:00Z | 9.4 MB |
| `marine_recent` | 1,824 | 2026-10-22T00:00Z | 2026-10-24T08:00Z | 0.0 MB |
| `metar` | 9 | 2026-10-24T05:00:00+00:00 | 2026-10-24T07:00:00+00:00 | 0.0 MB |
| `oisst_daily` | 180,040 | 2025-01-01 | 2026-10-08 | 0.7 MB |
| `points` | 32 |  |  | 0.0 MB |
| `wx_current` | 96 | 2026-10-24T07:00Z | 2026-10-24T08:00Z | 0.0 MB |
| `wx_recent` | 1,824 | 2026-10-22T00:00Z | 2026-10-24T08:00Z | 0.0 MB |

## Schema

```sql
CREATE TABLE era5_hourly(
  point_id TEXT NOT NULL, time TEXT NOT NULL,
  wind_speed_10m REAL, wind_direction_10m REAL, wind_gusts_10m REAL,
  precipitation REAL, pressure_msl REAL, temperature_2m REAL,
  PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE fc_hourly(issued_at TEXT, point_id TEXT, time TEXT, lead_h INTEGER,
  wind_speed_10m REAL,wind_direction_10m REAL,wind_gusts_10m REAL,precipitation REAL,pressure_msl REAL,temperature_2m REAL, PRIMARY KEY(issued_at, point_id, time)) WITHOUT ROWID;
CREATE TABLE fetch_log(
  source TEXT NOT NULL, chunk TEXT NOT NULL, done_at TEXT, rows INTEGER,
  PRIMARY KEY(source, chunk));
CREATE TABLE grid_cell(
  point_id TEXT NOT NULL, source TEXT NOT NULL, grid_lat REAL, grid_lon REAL,
  PRIMARY KEY(point_id, source));
CREATE TABLE gsod_daily(
  station TEXT NOT NULL, point_id TEXT, date TEXT NOT NULL,
  temp_c REAL, dewp_c REAL, slp_hpa REAL, visib_km REAL,
  wdsp_ms REAL, mxspd_ms REAL, gust_ms REAL,
  prcp_mm REAL, prcp_flag TEXT, frshtt TEXT, n_obs INTEGER,
  PRIMARY KEY(station, date)) WITHOUT ROWID;
CREATE TABLE imerg_daily(
  date TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, precip_mm REAL,
  PRIMARY KEY(date, lat, lon)) WITHOUT ROWID;
CREATE TABLE imerg_days(date TEXT PRIMARY KEY, run TEXT, file TEXT, fetched_at TEXT);
CREATE TABLE imerg_hh(time TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, precip_mmhr REAL,
  PRIMARY KEY(time, lat, lon)) WITHOUT ROWID;
CREATE TABLE imerg_hh_files(time TEXT PRIMARY KEY, file TEXT, run TEXT, wet_cells INTEGER, fetched_at TEXT);
CREATE TABLE job_state(job TEXT PRIMARY KEY, ts TEXT, state TEXT, detail TEXT, next_at TEXT);
CREATE TABLE live_polls(ts TEXT, source TEXT, ok INTEGER, rows INTEGER, error TEXT);
CREATE TABLE marine_current(point_id TEXT, time TEXT, fetched_at TEXT,
  wave_height REAL,wave_direction REAL,wave_period REAL,wind_wave_height REAL,wind_wave_direction REAL,wind_wave_period REAL,swell_wave_height REAL,swell_wave_direction REAL,swell_wave_period REAL, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE marine_fc(issued_at TEXT, point_id TEXT, time TEXT, lead_h INTEGER,
  wave_height REAL,wave_direction REAL,wave_period REAL,wind_wave_height REAL,wind_wave_direction REAL,wind_wave_period REAL,swell_wave_height REAL,swell_wave_direction REAL,swell_wave_period REAL, PRIMARY KEY(issued_at, point_id, time)) WITHOUT ROWID;
CREATE TABLE marine_hourly(
  point_id TEXT NOT NULL, model TEXT NOT NULL, time TEXT NOT NULL,
  wave_height REAL, wave_direction REAL, wave_period REAL,
  wind_wave_height REAL, wind_wave_direction REAL, wind_wave_period REAL,
  swell_wave_height REAL, swell_wave_direction REAL, swell_wave_period REAL,
  PRIMARY KEY(point_id, model, time)) WITHOUT ROWID;
CREATE TABLE marine_recent(point_id TEXT, time TEXT, updated_at TEXT,
  wave_height REAL,wave_direction REAL,wave_period REAL,wind_wave_height REAL,wind_wave_direction REAL,wind_wave_period REAL,swell_wave_height REAL,swell_wave_direction REAL,swell_wave_period REAL, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE metar(station TEXT, obs_time TEXT, fetched_at TEXT,
  wdir TEXT, wspd_kt REAL, wgst_kt REAL, visib TEXT, temp_c REAL, dewp_c REAL, altim_hpa REAL,
  wx_string TEXT, cover TEXT, raw TEXT, PRIMARY KEY(station, obs_time)) WITHOUT ROWID;
CREATE TABLE oisst_daily(
  date TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, sst REAL,
  PRIMARY KEY(date, lat, lon)) WITHOUT ROWID;
CREATE TABLE points(
  id TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, region TEXT, role TEXT);
CREATE TABLE wx_current(point_id TEXT, time TEXT, fetched_at TEXT,
  wind_speed_10m REAL,wind_direction_10m REAL,wind_gusts_10m REAL,precipitation REAL,pressure_msl REAL,temperature_2m REAL,cloud_cover REAL,weather_code REAL, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE wx_recent(point_id TEXT, time TEXT, updated_at TEXT,
  wind_speed_10m REAL,wind_direction_10m REAL,wind_gusts_10m REAL,precipitation REAL,pressure_msl REAL,temperature_2m REAL, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
```

Rebuild a SQLite database from these files:

```bash
python3 weather/import_export.py weather/export rebuilt.sqlite
```
