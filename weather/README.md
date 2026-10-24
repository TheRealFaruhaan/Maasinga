# Weather across the atolls

**Using the data (backend):** read [DATA_GUIDE.md](DATA_GUIDE.md), which covers tables, units, joins, how each source
is collected and how to retrieve it live. A committed snapshot is in `export/` (gzipped CSV).

All data goes into `weather/data/weather.sqlite` (UTC times). Points are in
`points.py`: 17 down the chain every 0.5° lat, 10 either side of the wider
atolls, and the 5 GSOD station sites.

## Live (linkable to boat departures from the port collector)
Service `weather-live` (`live.py`), hourly at :05:
- `wx_current`, `marine_current`: current conditions
- `wx_recent`, `marine_recent`: last 48 h hourly, latest estimate wins (fills the ERA5 lag)
- `fc_hourly`, `marine_fc`: ECMWF IFS / Meteo-France wave forecast as issued, every 3 h, 64 h ahead
- `metar`: VRMM Velana, VRMH Hanimaadhoo, VRMG Gan (only Maldives airports on the NOAA feed)
- `imerg_hh` + `imerg_hh_files`: NASA IMERG Early half-hourly rain (mm/hr, 0.1°, ~5 h behind).
  Sparse: only wet cells are stored; a half-hour listed in `imerg_hh_files` with no row for a cell means 0.

## Archive (overview / seasonal context, 2025 onward)
Service `weather-backfill`, re-run daily at 06:30 by a Crundi schedule (current year re-fetched):
- `era5_hourly`: Open-Meteo ERA5: wind speed/dir/gust (m/s), precip, MSLP, T2m
- `marine_hourly` model `era5_ocean`: total wave height/dir/period only
- `marine_hourly` model `meteofrance_wave`: total + wind-wave + swell split (from 2021-10)
- `oisst_daily`: NOAA OISST v2.1 SST, 0.25° box (ERDDAP, ~2 weeks lag)
- `gsod_daily`: NOAA GSOD, metric. **NCEI has nothing for these stations after 2025-08-24.**
- `imerg_daily` + `imerg_days`: NASA IMERG daily rain (mm, 0.1° box), best run per date:
  Final (to ~3.5 months ago) > Late > Early, upgraded automatically. Service `imerg-backfill`,
  re-run daily at 06:45.

Open-Meteo free tier: non-commercial only. For commercial use pull ERA5 from the Copernicus CDS
(which also has swell partitions before 2021).

## IMERG setup
- Earthdata bearer token in `~/.config/earthdata/token` (chmod 600, outside the repo).
  **It expires 2026-12-23**: generate a new one at urs.earthdata.nasa.gov and overwrite the file.
  The widget warns two weeks ahead; on expiry IMERG steps fail with a 401 and log it.
- IMERG files are HDF5, read with h5py from the project venv: `weather/.venv` (built with
  `weather/.tools/uv`, no system packages). `live.py` and `fetch_imerg.py` run on `.venv/bin/python`.
- GES DISC OPeNDAP subsetting was returning 503s, so whole files are downloaded (~29 MB daily,
  ~7 MB half-hourly), the box is cut out, and the file is deleted.
