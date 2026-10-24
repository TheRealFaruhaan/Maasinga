"""Shared paths and helpers for the Maasinga pipeline."""
import json
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("MAASINGA_RAW", ROOT / "data" / "raw"))
WORK = ROOT / "data" / "work"
REF = ROOT / "pipeline" / "reference"
OUT = ROOT / "dashboard" / "public" / "data"

WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

PINGS = WORK / "pings.parquet"

# Maldives local time is UTC+5. FollowMe device_date is UTC (activity peaks 02:00-06:00 UTC = 07:00-11:00 local).
TZ_OFFSET_H = 5

# Boat classes from the 90th percentile of moving speed (knots).
FAST_KN = 22  # speedboats
DHONI_KN = 8  # dhonis, ferries, cargo


def db():
    con = duckdb.connect()
    con.execute("PRAGMA threads=8")
    return con


def write_json(name, obj):
    path = OUT / name
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")
