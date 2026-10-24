#!/usr/bin/env python3
"""Fetch hourly ERA5 weather and marine data from Open-Meteo for every point
in points.py into weather.sqlite. Resumable: finished (source, year, group)
chunks are logged in fetch_log and skipped; the current year is always
re-fetched so re-running tops it up.

Works newest year first so recent data is usable early. Paces itself under the
free-tier limits (600/min, 5000/hour, 10000/day weighted calls) and sleeps
through 429s.

Sources
  era5        archive-api   models=era5   wind speed/dir/gusts, precip, MSLP, T2m
  era5_ocean  marine-api    models=era5_ocean   total wave height/dir/period (2000+)
  mf_wave     marine-api    models=meteofrance_wave   total + wind-wave + swell (2021-10+)

Note: on Open-Meteo, ERA5-Ocean has no swell/wind-wave split. For that split
before Oct 2021 use ERA5 wave partitions from the Copernicus CDS.
"""
import argparse
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request

import net  # noqa: F401  (force IPv4)
import db as dbm
from points import POINTS

ERA5_VARS = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "precipitation", "pressure_msl", "temperature_2m"]
WAVE_TOTAL = ["wave_height", "wave_direction", "wave_period"]
WAVE_SPLIT = ["wind_wave_height", "wind_wave_direction", "wind_wave_period",
              "swell_wave_height", "swell_wave_direction", "swell_wave_period"]

SOURCES = {
    "era5": dict(url="https://archive-api.open-meteo.com/v1/archive", model="era5", vars=ERA5_VARS,
                 start=dt.date(2000, 1, 1), extra={"wind_speed_unit": "ms"}),
    "era5_ocean": dict(url="https://marine-api.open-meteo.com/v1/marine", model="era5_ocean", vars=WAVE_TOTAL,
                       start=dt.date(2000, 1, 1), extra={}),
    "mf_wave": dict(url="https://marine-api.open-meteo.com/v1/marine", model="meteofrance_wave",
                    vars=WAVE_TOTAL + WAVE_SPLIT, start=dt.date(2021, 10, 1), extra={}),
}
GROUP = 8                 # locations per request

UA = "maasinga-weather/1.0"
PACER = None


def log(*a):
    print(dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


class Pacer:
    """Spread requests evenly so the daily budget lasts the whole day,
    instead of bursting into the hourly/minutely limits and then stalling."""

    def __init__(self, db):
        self.db = db
        self.next_at = time.time()

    def state(self, state, detail, next_at=None):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO job_state VALUES('openmeteo_backfill',?,?,?,?)",
                            (dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), state, detail,
                             None if next_at is None else dt.datetime.fromtimestamp(next_at, dt.timezone.utc).isoformat(timespec="seconds")))

    def wait_for(self, weight, label):
        if self.next_at > time.time():
            self.state("waiting", f"pacing under the per-minute limit; next: {label}", self.next_at)
            log(f"pacing: next request ({label}) at {dt.datetime.fromtimestamp(self.next_at):%H:%M:%S}")
            while time.time() < self.next_at:
                time.sleep(5)
        self.state("fetching", label)

    def add(self, weight):
        # stay under the 600/minute limit; hourly/daily limits are handled by backing off on 429
        self.next_at = time.time() + weight / 500 * 60


def weight(nloc, nvars, days):
    return nloc * max(1.0, nvars / 10) * max(1.0, days / 14)


def get(url, params):
    q = url + "?" + urllib.parse.urlencode(params)
    while True:
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 429:
                reason = body.lower()
                pause = 3600 if "hour" in reason else 6 * 3600 if "daily" in reason or "day" in reason else 65
                log(f"429 rate limited ({body[:120]}); sleeping {pause}s")
                if PACER: PACER.state("waiting", "Open-Meteo rate limit: " + body[:80], time.time() + pause)
                time.sleep(pause)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body[:300]}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            log(f"network error {e!r}; retry in 60s")
            time.sleep(60)


def fetch_chunk(db, pacer, name, year, group, end_cap):
    src = SOURCES[name]
    start = max(dt.date(year, 1, 1), src["start"])
    end = min(dt.date(year, 12, 31), end_cap)
    if year == end_cap.year:  # current year: only fetch what we don't have yet
        ids = [p[0] for p in group]
        if name == "era5":
            r = db.execute(f"SELECT count(*), min(m) FROM (SELECT max(time) m FROM era5_hourly WHERE point_id IN ({','.join('?'*len(ids))}) AND time >= ? GROUP BY point_id)", ids + [f"{year}-01-01"]).fetchone()
        else:
            r = db.execute(f"SELECT count(*), min(m) FROM (SELECT max(time) m FROM marine_hourly WHERE model=? AND point_id IN ({','.join('?'*len(ids))}) AND time >= ? GROUP BY point_id)", [src["model"]] + ids + [f"{year}-01-01"]).fetchone()
        if r[0] == len(ids) and r[1]:
            start = max(start, dt.date.fromisoformat(r[1][:10]))  # re-fetch the last stored day
    if start >= end and year == end_cap.year:
        return 0
    if start > end:
        return 0
    days = (end - start).days + 1
    w = weight(len(group), len(src["vars"]), days)
    pacer.wait_for(w, f"{name} {year} group {group[0][0]}..")
    params = dict(latitude=",".join(str(p[2]) for p in group), longitude=",".join(str(p[3]) for p in group),
                  start_date=start.isoformat(), end_date=end.isoformat(), hourly=",".join(src["vars"]),
                  models=src["model"], timezone="GMT", **src["extra"])
    data = get(src["url"], params)
    pacer.add(w)
    if isinstance(data, dict):
        data = [data]
    rows = 0
    with db:
        for p, d in zip(group, data):
            h = d.get("hourly") or {}
            times = h.get("time") or []
            db.execute("INSERT OR REPLACE INTO grid_cell VALUES(?,?,?,?)", (p[0], name, d.get("latitude"), d.get("longitude")))
            if name == "era5":
                cols = ERA5_VARS
                recs = [(p[0], t + "Z", *[h.get(c, [None] * len(times))[i] for c in cols]) for i, t in enumerate(times)]
                db.executemany(f"INSERT OR REPLACE INTO era5_hourly(point_id,time,{','.join(cols)}) VALUES(?,?,{','.join('?' * len(cols))})", recs)
            else:
                cols = src["vars"]
                recs = [(p[0], src["model"], t + "Z", *[h.get(c, [None] * len(times))[i] for c in cols]) for i, t in enumerate(times)]
                db.executemany(f"INSERT OR REPLACE INTO marine_hourly(point_id,model,time,{','.join(cols)}) VALUES(?,?,?,{','.join('?' * len(cols))})", recs)
            rows += len(recs)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-year", type=int, default=2025)
    ap.add_argument("--sources", default="mf_wave,era5,era5_ocean")
    a = ap.parse_args()
    db = dbm.connect()
    db.execute("CREATE TABLE IF NOT EXISTS job_state(job TEXT PRIMARY KEY, ts TEXT, state TEXT, detail TEXT, next_at TEXT)")
    global PACER
    pacer = PACER = Pacer(db)
    today = dt.datetime.now(dt.timezone.utc).date()
    end_cap = today - dt.timedelta(days=6)   # ERA5 on Open-Meteo lags ~5 days
    groups = [POINTS[i:i + GROUP] for i in range(0, len(POINTS), GROUP)]
    sources = a.sources.split(",")
    log(f"start: years {today.year}..{a.from_year}, sources {sources}, {len(POINTS)} points, end cap {end_cap}")
    for year in range(today.year, a.from_year - 1, -1):
        for name in sources:
            if year < SOURCES[name]["start"].year:
                continue
            for gi, group in enumerate(groups):
                chunk = f"{year}:g{gi}"
                complete_year = year < end_cap.year
                if complete_year and dbm.is_done(db, name, chunk):
                    continue
                t0 = time.monotonic()
                n = fetch_chunk(db, pacer, name, year, group, end_cap)
                if complete_year:
                    with db:
                        dbm.mark_done(db, name, chunk, n)
                log(f"{name} {chunk}: {n} rows in {time.monotonic() - t0:.1f}s ")
    pacer.state("done", f"all chunks up to {end_cap} fetched")
    log("all chunks done")


if __name__ == "__main__":
    main()
