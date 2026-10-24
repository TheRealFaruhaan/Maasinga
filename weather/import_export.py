#!/usr/bin/env python3
"""Rebuild a SQLite database from an export folder (MANIFEST.md + <table>.csv.gz).

  python3 weather/import_export.py weather/export weather.sqlite
  python3 weather/import_export.py collector/export port.sqlite

Uses the schema in MANIFEST.md, so column types and primary keys match the original.
"""
import csv
import gzip
import os
import re
import sqlite3
import sys


def main(folder, dest):
    manifest = open(os.path.join(folder, "MANIFEST.md")).read()
    schema = re.search(r"```sql\n(.*?)```", manifest, re.S).group(1)
    db = sqlite3.connect(dest)
    db.executescript(schema)
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith(".csv.gz"):
            continue
        table = fn[:-7]
        with gzip.open(os.path.join(folder, fn), "rt", newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            cols = next(r)
            sql = f"INSERT OR REPLACE INTO {table}({','.join(cols)}) VALUES({','.join('?' * len(cols))})"
            with db:
                db.executemany(sql, ([None if v == "" else v for v in row] for row in r))
        print(table, db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], "rows")
    db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
