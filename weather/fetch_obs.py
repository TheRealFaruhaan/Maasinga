#!/usr/bin/env python3
"""Fetch NOAA products that need no account:
  gsod   GSOD daily station observations for the five Maldives stations
  oisst  OISST v2.1 daily sea surface temperature over the chain (via NOAA CoastWatch ERDDAP)
Resumable per year; the current year is always re-fetched.
"""
import argparse
import csv
import datetime as dt
import io
import time
import urllib.error
import urllib.request

import net  # noqa: F401  (force IPv4)
import db as dbm
from points import BOX, GSOD_STATIONS

UA = "maasinga-weather/1.0"
KT = 0.514444


def log(*a):
    print(dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=300) as r:
                return r.read().decode()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if i == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == tries - 1:
                raise
        time.sleep(30 * (i + 1))


def num(s, missing):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return None if v >= missing else v


def gsod(db, years, this_year):
    for y in years:
        for st, pid in GSOD_STATIONS.items():
            chunk = f"{y}:{st}"
            if y < this_year and dbm.is_done(db, "gsod", chunk):
                continue
            body = get(f"https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{y}/{st}.csv")
            rows = []
            for r in csv.DictReader(io.StringIO(body or "")):
                t = num(r["TEMP"], 9999); d = num(r["DEWP"], 9999)
                p = num(r["PRCP"], 99.99)
                rows.append((st, pid, r["DATE"],
                             None if t is None else round((t - 32) / 1.8, 2),
                             None if d is None else round((d - 32) / 1.8, 2),
                             num(r["SLP"], 9999), None if num(r["VISIB"], 999) is None else round(float(r["VISIB"]) * 1.609, 2),
                             *[None if num(r[k], 999) is None else round(float(r[k]) * KT, 2) for k in ("WDSP", "MXSPD", "GUST")],
                             None if p is None else round(p * 25.4, 2), (r["PRCP_ATTRIBUTES"] or "").strip() or None,
                             r["FRSHTT"], int(r["TEMP_ATTRIBUTES"] or 0)))
            with db:
                db.executemany("INSERT OR REPLACE INTO gsod_daily VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
                if y < this_year:
                    dbm.mark_done(db, "gsod", chunk, len(rows))
            log(f"gsod {chunk}: {len(rows)} days" + (" (no file)" if body is None else ""))


def oisst(db, years, this_year):
    b = BOX
    for y in years:
        chunk = str(y)
        if y < this_year and dbm.is_done(db, "oisst", chunk):
            continue
        end = f"({y}-12-31T12:00:00Z)" if y < this_year else "(last)"
        url = ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.csv?"
               f"sst%5B({y}-01-01T12:00:00Z):1:{end}%5D%5B(0.0)%5D"
               f"%5B({b['lat_min']}):1:({b['lat_max']})%5D%5B({b['lon_min']}):1:({b['lon_max']})%5D")
        body = get(url)
        lines = (body or "").splitlines()[2:]  # skip header + units rows
        rows = []
        for r in csv.reader(lines):
            if len(r) == 5:
                rows.append((r[0][:10], float(r[2]), float(r[3]), None if r[4] in ("", "NaN") else float(r[4])))
        with db:
            db.executemany("INSERT OR REPLACE INTO oisst_daily VALUES(?,?,?,?)", rows)
            if y < this_year:
                dbm.mark_done(db, "oisst", chunk, len(rows))
        log(f"oisst {y}: {len(rows)} cell-days")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", nargs="*", default=["gsod", "oisst"])
    ap.add_argument("--from-year", type=int, default=2025)
    a = ap.parse_args()
    db = dbm.connect()
    this_year = dt.date.today().year
    years = list(range(this_year, a.from_year - 1, -1))
    if "gsod" in a.what:
        gsod(db, years, this_year)
    if "oisst" in a.what:
        oisst(db, years, this_year)
    log("done")


if __name__ == "__main__":
    main()
