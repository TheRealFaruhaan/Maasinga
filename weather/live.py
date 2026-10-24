#!/usr/bin/env python3
"""Live weather collector. Runs alongside the port collector so every boat
departure/arrival it records can be joined to the weather that was known at
that moment.

Each hour (at ~:05) for every point in points.py:
  wx_current      current conditions (Open-Meteo forecast API, best match)
  wx_recent       last 48 h of hourly model values, latest estimate wins
                  (closes the ~5-day gap until ERA5 arrives)
  fc_hourly       ECMWF IFS 0.25 hourly forecast, 3 days ahead, as issued
                  (stored every 3 hours): what a skipper would have seen
  marine_current / marine_recent / marine_fc   same for waves and swell
                  (Meteo-France wave model, same as the mf_wave backfill)
  metar           airport observations (Velana, Hanimaadhoo, Gan) as ground truth
  imerg_hh        NASA IMERG Early half-hourly rain (~5 h behind), sparse: wet cells only

All times UTC.
"""
import argparse
import datetime as dt
import json
import signal
import time
import urllib.error
import urllib.parse
import urllib.request

import net  # noqa: F401  (force IPv4)
import db as dbm
from points import POINTS

UA = "maasinga-weather-live/1.0"
WX = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "precipitation", "pressure_msl", "temperature_2m"]
WX_CUR = WX + ["cloud_cover", "weather_code"]
SEA = ["wave_height", "wave_direction", "wave_period", "wind_wave_height", "wind_wave_direction", "wind_wave_period",
       "swell_wave_height", "swell_wave_direction", "swell_wave_period"]
METAR_IDS = "VRMM,VRMH,VRMG,VRMK,VRMT"
FC_EVERY_H = 3

LIVE_SCHEMA = """
CREATE TABLE IF NOT EXISTS wx_current(point_id TEXT, time TEXT, fetched_at TEXT,
  {wxc}, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wx_recent(point_id TEXT, time TEXT, updated_at TEXT,
  {wx}, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS fc_hourly(issued_at TEXT, point_id TEXT, time TEXT, lead_h INTEGER,
  {wx}, PRIMARY KEY(issued_at, point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS marine_current(point_id TEXT, time TEXT, fetched_at TEXT,
  {sea}, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS marine_recent(point_id TEXT, time TEXT, updated_at TEXT,
  {sea}, PRIMARY KEY(point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS marine_fc(issued_at TEXT, point_id TEXT, time TEXT, lead_h INTEGER,
  {sea}, PRIMARY KEY(issued_at, point_id, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS metar(station TEXT, obs_time TEXT, fetched_at TEXT,
  wdir TEXT, wspd_kt REAL, wgst_kt REAL, visib TEXT, temp_c REAL, dewp_c REAL, altim_hpa REAL,
  wx_string TEXT, cover TEXT, raw TEXT, PRIMARY KEY(station, obs_time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS live_polls(ts TEXT, source TEXT, ok INTEGER, rows INTEGER, error TEXT);
""".format(wxc=",".join(f"{c} REAL" for c in WX_CUR), wx=",".join(f"{c} REAL" for c in WX),
           sea=",".join(f"{c} REAL" for c in SEA))

running = True


def log(*a):
    print(dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def get(url, params=None):
    q = url + ("?" + urllib.parse.urlencode(params) if params else "")
    with urllib.request.urlopen(urllib.request.Request(q, headers={"User-Agent": UA}), timeout=120) as r:
        return json.loads(r.read())


def coords():
    return dict(latitude=",".join(str(p[2]) for p in POINTS), longitude=",".join(str(p[3]) for p in POINTS))


def ins(db, table, cols, rows):
    db.executemany(f"INSERT OR REPLACE INTO {table}({','.join(cols)}) VALUES({','.join('?' * len(cols))})", rows)
    return len(rows)


def store_model(db, data, cur_vars, hr_vars, t_cur, t_recent, t_fc, now, issued):
    """data: list (one per point) of Open-Meteo responses with current + hourly."""
    n = 0
    now_s = now.strftime("%Y-%m-%dT%H:%M")
    for p, d in zip(POINTS, data):
        c = d.get("current") or {}
        if c.get("time"):
            n += ins(db, t_cur, ["point_id", "time", "fetched_at"] + cur_vars,
                     [(p[0], c["time"] + "Z", now.isoformat(), *[c.get(v) for v in cur_vars])])
        h = d.get("hourly") or {}
        times = h.get("time") or []
        past = [(p[0], t + "Z", now.isoformat(), *[h[v][i] for v in hr_vars]) for i, t in enumerate(times) if t <= now_s]
        n += ins(db, t_recent, ["point_id", "time", "updated_at"] + hr_vars, past)
        if issued and t_fc:
            fut = []
            for i, t in enumerate(times):
                if t > now_s:
                    lead = int((dt.datetime.fromisoformat(t) - now.replace(tzinfo=None)).total_seconds() // 3600) + 1
                    fut.append((issued, p[0], t + "Z", lead, *[h[v][i] for v in hr_vars]))
            n += ins(db, t_fc, ["issued_at", "point_id", "time", "lead_h"] + hr_vars, fut)
    return n


def poll(db):
    now = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
    issued = now.replace(minute=0).isoformat() if now.hour % FC_EVERY_H == 0 else None
    jobs = []

    def wx():
        cur = get("https://api.open-meteo.com/v1/forecast", dict(
            **coords(), current=",".join(WX_CUR), wind_speed_unit="ms", timezone="GMT", forecast_days=1))
        fc = get("https://api.open-meteo.com/v1/forecast", dict(
            **coords(), hourly=",".join(WX), models="ecmwf_ifs025", wind_speed_unit="ms", timezone="GMT",
            past_days=2, forecast_days=3))
        cur = cur if isinstance(cur, list) else [cur]
        fc = fc if isinstance(fc, list) else [fc]
        merged = [dict(current=a.get("current"), hourly=b.get("hourly")) for a, b in zip(cur, fc)]
        return store_model(db, merged, WX_CUR, WX, "wx_current", "wx_recent", "fc_hourly", now, issued)

    def sea():
        d = get("https://marine-api.open-meteo.com/v1/marine", dict(
            **coords(), current=",".join(SEA), hourly=",".join(SEA), models="meteofrance_wave", timezone="GMT",
            past_days=2, forecast_days=3))
        d = d if isinstance(d, list) else [d]
        return store_model(db, d, SEA, SEA, "marine_current", "marine_recent", "marine_fc", now, issued)

    def metar():
        d = get("https://aviationweather.gov/api/data/metar", dict(ids=METAR_IDS, format="json", hours=3))
        rows = [(m["icaoId"], dt.datetime.fromtimestamp(m["obsTime"], dt.timezone.utc).isoformat(), now.isoformat(),
                 str(m.get("wdir")), m.get("wspd"), m.get("wgst"), str(m.get("visib")), m.get("temp"), m.get("dewp"),
                 m.get("altim"), m.get("wxString"), m.get("cover"), m.get("rawOb")) for m in d]
        return ins(db, "metar", ["station", "obs_time", "fetched_at", "wdir", "wspd_kt", "wgst_kt", "visib", "temp_c",
                                 "dewp_c", "altim_hpa", "wx_string", "cover", "raw"], rows)

    def imerg():
        import fetch_imerg  # needs h5py: run live.py with weather/.venv/bin/python
        db.executescript(fetch_imerg.SCHEMA)
        return fetch_imerg.live(db, hours=12)

    out = []
    for name, fn in (("wx", wx), ("sea", sea), ("metar", metar), ("imerg", imerg)):
        try:
            with db:
                n = fn()
                db.execute("INSERT INTO live_polls VALUES(?,?,?,?,?)", (now.isoformat(), name, 1, n, None))
            out.append(f"{name}:{n}")
        except Exception as e:
            with db:
                db.execute("INSERT INTO live_polls VALUES(?,?,?,?,?)", (now.isoformat(), name, 0, 0, repr(e)[:500]))
            out.append(f"{name}:ERR {e!r}"[:150])
    log(("forecast issued " + issued + " | " if issued else "") + " ".join(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--minute", type=int, default=5, help="minute past the hour to poll")
    a = ap.parse_args()
    db = dbm.connect()
    db.executescript(LIVE_SCHEMA)

    def stop(*_):
        global running
        running = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    log("live weather collector start")
    poll(db)
    while running and not a.once:
        now = dt.datetime.now()
        nxt = now.replace(minute=a.minute, second=0, microsecond=0)
        if nxt <= now:
            nxt += dt.timedelta(hours=1)
        while running and dt.datetime.now() < nxt:
            time.sleep(5)
        if running:
            poll(db)
    log("stopped")


if __name__ == "__main__":
    main()
