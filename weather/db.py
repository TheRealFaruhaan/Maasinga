import os
import sqlite3

from points import POINTS

DB_PATH = os.environ.get("WEATHER_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "weather.sqlite"))

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS points(
  id TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, region TEXT, role TEXT);

-- Open-Meteo historical (ERA5), hourly, UTC
CREATE TABLE IF NOT EXISTS era5_hourly(
  point_id TEXT NOT NULL, time TEXT NOT NULL,
  wind_speed_10m REAL, wind_direction_10m REAL, wind_gusts_10m REAL,
  precipitation REAL, pressure_msl REAL, temperature_2m REAL,
  PRIMARY KEY(point_id, time)) WITHOUT ROWID;

-- Open-Meteo Marine, hourly, UTC. model = era5_ocean (total sea only, 2000+)
-- or meteofrance_wave (total + wind-wave + swell split, Oct 2021+)
CREATE TABLE IF NOT EXISTS marine_hourly(
  point_id TEXT NOT NULL, model TEXT NOT NULL, time TEXT NOT NULL,
  wave_height REAL, wave_direction REAL, wave_period REAL,
  wind_wave_height REAL, wind_wave_direction REAL, wind_wave_period REAL,
  swell_wave_height REAL, swell_wave_direction REAL, swell_wave_period REAL,
  PRIMARY KEY(point_id, model, time)) WITHOUT ROWID;

-- grid cell Open-Meteo actually used for each point/source
CREATE TABLE IF NOT EXISTS grid_cell(
  point_id TEXT NOT NULL, source TEXT NOT NULL, grid_lat REAL, grid_lon REAL,
  PRIMARY KEY(point_id, source));

-- NOAA OISST v2.1 daily SST, 0.25 deg box over the chain
CREATE TABLE IF NOT EXISTS oisst_daily(
  date TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, sst REAL,
  PRIMARY KEY(date, lat, lon)) WITHOUT ROWID;

-- NOAA GSOD station daily observations, converted to metric (NULL = missing)
CREATE TABLE IF NOT EXISTS gsod_daily(
  station TEXT NOT NULL, point_id TEXT, date TEXT NOT NULL,
  temp_c REAL, dewp_c REAL, slp_hpa REAL, visib_km REAL,
  wdsp_ms REAL, mxspd_ms REAL, gust_ms REAL,
  prcp_mm REAL, prcp_flag TEXT, frshtt TEXT, n_obs INTEGER,
  PRIMARY KEY(station, date)) WITHOUT ROWID;

-- NASA GPM IMERG precipitation (mm), per grid cell; daily totals
CREATE TABLE IF NOT EXISTS imerg_daily(
  date TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, precip_mm REAL,
  PRIMARY KEY(date, lat, lon)) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS fetch_log(
  source TEXT NOT NULL, chunk TEXT NOT NULL, done_at TEXT, rows INTEGER,
  PRIMARY KEY(source, chunk));
"""


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=60)
    db.executescript(SCHEMA)
    db.executemany("INSERT OR REPLACE INTO points VALUES(?,?,?,?,?,?)", POINTS)
    db.commit()
    return db


def is_done(db, source, chunk):
    return db.execute("SELECT 1 FROM fetch_log WHERE source=? AND chunk=? AND done_at IS NOT NULL",
                      (source, chunk)).fetchone() is not None


def mark_done(db, source, chunk, rows):
    db.execute("INSERT OR REPLACE INTO fetch_log VALUES(?,?,datetime('now'),?)", (source, chunk, rows))
