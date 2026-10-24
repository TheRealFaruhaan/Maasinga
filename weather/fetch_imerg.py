#!/usr/bin/env python3
"""NASA GPM IMERG precipitation over the Maldives box (0.1 deg).

  archive  daily totals (mm) from 2025, best run available per date:
           Final (F, ~3.5 months behind) > Late (L, ~1.5 days) > Early (E, ~1 day).
           Dates stored from a worse run are upgraded when a better one appears.
  live     half-hourly Early run (mm/hr, ~4 h behind), last N hours.
           Stored sparse: only cells with rain > 0; a row in imerg_hh_files means
           the half-hour was read, so missing cells in it are zero.

Needs an Earthdata bearer token in ~/.config/earthdata/token (or $EARTHDATA_TOKEN_FILE),
and h5py: run with weather/.venv/bin/python.
"""
import argparse
import datetime as dt
import os
import re
import tempfile
import time
import urllib.error
import urllib.request

import h5py
import numpy as np

import net  # noqa: F401  (force IPv4)
import db as dbm
from points import BOX

TOKEN_FILE = os.environ.get("EARTHDATA_TOKEN_FILE", os.path.expanduser("~/.config/earthdata/token"))
LIST_HOST = "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3"
DL_HOSTS = ["https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3", "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3"]
DAILY = {"F": "GPM_3IMERGDF.07", "L": "GPM_3IMERGDL.07", "E": "GPM_3IMERGDE.07"}
RANK = {"E": 1, "L": 2, "F": 3}
HHE = "GPM_3IMERGHHE.07"
GPS_EPOCH = dt.datetime(1980, 1, 6, tzinfo=dt.timezone.utc)
TMP = os.path.join(os.path.dirname(dbm.DB_PATH), "tmp")

SCHEMA = """
CREATE TABLE IF NOT EXISTS imerg_days(date TEXT PRIMARY KEY, run TEXT, file TEXT, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS imerg_hh(time TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, precip_mmhr REAL,
  PRIMARY KEY(time, lat, lon)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS imerg_hh_files(time TEXT PRIMARY KEY, file TEXT, run TEXT, wet_cells INTEGER, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS job_state(job TEXT PRIMARY KEY, ts TEXT, state TEXT, detail TEXT, next_at TEXT);
"""


class AuthError(Exception):
    pass


def log(*a):
    print(dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def token():
    with open(TOKEN_FILE) as f:
        return f.read().strip()


def state(db, job, st, detail):
    with db:
        db.execute("INSERT OR REPLACE INTO job_state VALUES(?,?,?,?,NULL)", (job, now_iso(), st, detail))


def http(url, dest=None, timeout=600, tries=4):
    for i in range(tries):
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token(), "User-Agent": "maasinga-weather/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if dest is None:
                    return r.read().decode(errors="replace")
                with open(dest, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                return dest
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise AuthError(f"HTTP {e.code} from NASA: Earthdata token expired or app not authorised")
            if e.code == 404:
                return None
            err = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = repr(e)
        log(f"  {err} on {url.rsplit('/', 1)[-1]}; retry {i + 1}/{tries}")
        time.sleep(20 * (i + 1))
    raise RuntimeError(f"giving up on {url}")


_listing = {}
import threading
_list_lock = threading.Lock()
_path_locks = {}


def listing(path):
    """File names in a GES DISC directory (cached, one fetch per directory)."""
    with _list_lock:  # one lock per directory, so different months list in parallel
        lock = _path_locks.setdefault(path, threading.Lock())
    with lock:
        if path not in _listing:
            html = http(f"{LIST_HOST}/{path}/", timeout=180) or ""
            _listing[path] = sorted(set(re.findall(r'href="(3B-[^"]+\.(?:nc4|HDF5))"', html)))
        return _listing[path]


def download(path, name):
    os.makedirs(TMP, exist_ok=True)
    fd, dest = tempfile.mkstemp(dir=TMP, suffix="-" + name)
    os.close(fd)
    for host in DL_HOSTS:
        if http(f"{host}/{path}/{name}", dest) and open(dest, "rb").read(4) == b"\x89HDF":
            return dest
    os.unlink(dest)
    raise RuntimeError(f"could not download {name}")


def read_box(fname):
    with h5py.File(fname, "r") as h:
        g = h["Grid"] if "Grid" in h else h
        lat, lon = g["lat"][:], g["lon"][:]
        li = np.where((lat >= BOX["lat_min"]) & (lat <= BOX["lat_max"]))[0]
        lo = np.where((lon >= BOX["lon_min"]) & (lon <= BOX["lon_max"]))[0]
        p = g["precipitation"][0, lo[0]:lo[-1] + 1, li[0]:li[-1] + 1].astype(float)
        p[p < 0] = np.nan
        t = int(g["time"][0]) if "time" in g else None
        return lat[li], lon[lo], p, t


# ---------------------------------------------------------------- archive

def best_file(day):
    for run in ("F", "L", "E"):
        path = f"{DAILY[run]}/{day:%Y/%m}"
        for n in listing(path):
            if f".{day:%Y%m%d}-S000000" in n:
                return run, path, n
    return None


PREFIX = {"F": "3B-DAY", "L": "3B-DAY-L", "E": "3B-DAY-E"}
VERSIONS = {"F": ("V07B", "V07C"), "L": ("V07C", "V07B"), "E": ("V07C", "V07B")}


def _try_download(path, name):
    """Download from the fast host only; None if the file isn't there."""
    os.makedirs(TMP, exist_ok=True)
    fd, dest = tempfile.mkstemp(dir=TMP, suffix="-" + name)
    os.close(fd)
    ok = http(f"{DL_HOSTS[0]}/{path}/{name}", dest)
    if ok and open(dest, "rb").read(4) == b"\x89HDF":
        return dest
    os.unlink(dest)
    return None


def _fetch_day(day):
    """Try the daily file names directly (no directory listing). Runs in a worker thread."""
    f_possible = day < dt.date.today() - dt.timedelta(days=90)
    for run in (("F", "L", "E") if f_possible else ("L", "E")):
        path = f"{DAILY[run]}/{day:%Y/%m}"
        for ver in VERSIONS[run]:
            name = f"{PREFIX[run]}.MS.MRG.3IMERG.{day:%Y%m%d}-S000000-E235959.{ver}.nc4"
            f = _try_download(path, name)
            if f:
                try:
                    lat, lon, p, _ = read_box(f)
                finally:
                    os.unlink(f)
                return day, (run, name, lat, lon, p)
    return day, None


def archive(db, start, end, workers=8):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    have = dict(db.execute("SELECT date, run FROM imerg_days").fetchall())
    days = [start + dt.timedelta(d) for d in range((end - start).days + 1)]
    # Final lags ~3.5 months: dates already at L inside that window cannot improve yet
    f_cutoff = dt.date.today() - dt.timedelta(days=75)
    todo = [d for d in days if have.get(d.isoformat()) != "F"
            and not (have.get(d.isoformat()) == "L" and d > f_cutoff)]
    log(f"archive: {len(todo)} of {len(days)} days to fetch or upgrade, {workers} workers")
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_fetch_day, d) for d in todo]
        for fut in as_completed(futs):
            day, res = fut.result()
            done += 1
            if not res:
                continue
            run, name, lat, lon, p = res
            ds = day.isoformat()
            cur = have.get(ds)
            if cur and RANK[run] <= RANK[cur]:
                continue
            rows = [(ds, round(float(la), 3), round(float(lo_), 3), None if np.isnan(p[j, k]) else round(float(p[j, k]), 3))
                    for j, lo_ in enumerate(lon) for k, la in enumerate(lat)]
            with db:
                db.executemany("INSERT OR REPLACE INTO imerg_daily VALUES(?,?,?,?)", rows)
                db.execute("INSERT OR REPLACE INTO imerg_days VALUES(?,?,?,?)", (ds, run, name, now_iso()))
            if done % 10 == 0 or done == len(todo):
                state(db, "imerg", "fetching", f"daily archive {done}/{len(todo)} days")
            log(f"daily {ds} {run}: box mean {np.nanmean(p):.2f} mm, max {np.nanmax(p):.1f} mm ({done}/{len(todo)})")
    state(db, "imerg", "done", f"daily archive up to {end}")


# ---------------------------------------------------------------- live

def live(db, hours=12):
    now = dt.datetime.now(dt.timezone.utc)
    have = {r[0] for r in db.execute("SELECT time FROM imerg_hh_files WHERE time >= ?",
                                     ((now - dt.timedelta(hours=hours + 1)).strftime("%Y-%m-%dT%H:%M"),))}
    n = 0
    for d in sorted({(now - dt.timedelta(hours=h)).date() for h in (0, hours)}):
        path = f"{HHE}/{d:%Y}/{d.timetuple().tm_yday:03d}"
        for name in listing(path):
            m = re.search(r"\.(\d{8})-S(\d{6})-", name)
            t = dt.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
            ts = t.strftime("%Y-%m-%dT%H:%MZ")
            if t < now - dt.timedelta(hours=hours) or ts in have:
                continue
            f = download(path, name)
            try:
                lat, lon, p, _ = read_box(f)
            finally:
                os.unlink(f)
            wet = [(ts, round(float(la), 3), round(float(lo_), 3), round(float(p[j, k]), 3))
                   for j, lo_ in enumerate(lon) for k, la in enumerate(lat) if p[j, k] > 0]
            with db:
                db.executemany("INSERT OR REPLACE INTO imerg_hh VALUES(?,?,?,?)", wet)
                db.execute("INSERT OR REPLACE INTO imerg_hh_files VALUES(?,?,?,?,?)", (ts, name, "E", len(wet), now_iso()))
            n += 1
    _listing.clear()
    return n


def token_expiry():
    import base64, json
    try:
        part = token().split(".")[1]
        exp = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))["exp"]
        return dt.datetime.fromtimestamp(exp, dt.timezone.utc)
    except Exception:
        return None


def connect():
    db = dbm.connect()
    db.executescript(SCHEMA)
    exp = token_expiry()
    with db:
        db.execute("INSERT OR REPLACE INTO job_state VALUES('earthdata_token',?,?,?,?)",
                   (now_iso(), "ok" if exp and exp > dt.datetime.now(dt.timezone.utc) else "expired",
                    "Earthdata bearer token", exp.isoformat(timespec="seconds") if exp else None))
    return db


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["archive", "live"])
    ap.add_argument("--from", dest="start", default="2025-01-01")
    ap.add_argument("--hours", type=int, default=12)
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()
    db = connect()
    try:
        if a.mode == "archive":
            end = dt.date.today() - dt.timedelta(days=1)
            archive(db, dt.date.fromisoformat(a.start), end, a.workers)
        else:
            log(f"live: {live(db, a.hours)} half-hours stored")
    except AuthError as e:
        state(db, "imerg", "error", str(e))
        log("ERROR", e)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
