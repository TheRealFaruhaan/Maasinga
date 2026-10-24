#!/usr/bin/env python3
"""Export the weather and port databases to gzipped CSV for committing to git.

  weather/export/<table>.csv.gz     every table in weather/data/weather.sqlite
  collector/export/<table>.csv.gz   every table in collector/data/port.sqlite (raw JSON blobs skipped)
  .../export/MANIFEST.md            tables, row counts, time ranges and export time

The live databases keep growing. This is a snapshot; re-run to refresh it.
Reads through the SQLite backup API, so it's safe while the collectors are running.
"""
import csv
import datetime as dt
import gzip
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS = [
    ("weather/data/weather.sqlite", "weather/export", set()),
    ("collector/data/port.sqlite", "collector/export", {"raw"}),  # raw = gzipped JSON blobs, normalised elsewhere
]
TIME_COLS = ("time", "date", "ts", "obs_time", "issued_at")


def snapshot(path):
    src = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=60)
    mem = sqlite3.connect(":memory:")
    src.backup(mem)
    src.close()
    return mem


def export(db_rel, out_rel, skip):
    db = snapshot(os.path.join(ROOT, db_rel))
    out = os.path.join(ROOT, out_rel)
    os.makedirs(out, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    lines = [f"# Export of `{db_rel}`", "", f"Exported {stamp} (UTC). Gzipped CSV, header row, UTF-8; empty field = NULL.",
             "See weather/DATA_GUIDE.md for what each table means.", "",
             "| table | rows | from | to | file size |", "|---|---:|---|---|---:|"]
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    for t in tables:
        if t in skip:
            continue
        cur = db.execute(f"SELECT * FROM {t}")
        cols = [c[0] for c in cur.description]
        fn = os.path.join(out, f"{t}.csv.gz")
        n = 0
        with gzip.open(fn, "wt", newline="", encoding="utf-8", compresslevel=9) as f:
            w = csv.writer(f)
            w.writerow(cols)
            for row in cur:
                w.writerow(["" if v is None else v for v in row])
                n += 1
        tc = next((c for c in TIME_COLS if c in cols), None)
        lo, hi = db.execute(f"SELECT min({tc}), max({tc}) FROM {t}").fetchone() if tc else ("", "")
        size = os.path.getsize(fn)
        lines.append(f"| `{t}` | {n:,} | {lo or ''} | {hi or ''} | {size / 1e6:.1f} MB |")
        print(f"{out_rel}/{t}.csv.gz  {n:>9,} rows  {size / 1e6:6.1f} MB", flush=True)
    schema = "\n".join(r[0] + ";" for r in db.execute("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name")
                       if r[0] and not any(f"TABLE {s}(" in r[0] for s in skip))
    lines += ["", "## Schema", "", "```sql", schema, "```", "",
              "Rebuild a SQLite database from these files:", "", "```bash",
              "python3 weather/import_export.py " + out_rel + " rebuilt.sqlite", "```", ""]
    with open(os.path.join(out, "MANIFEST.md"), "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    for job in JOBS:
        export(*job)
