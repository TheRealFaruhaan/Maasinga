"""Step 10: display names for the coded boats (demo only).

Input: data/raw/imei_name_guess_all.csv (team list, one row per tracker; guess_name is a best guess, not a register).
Each boat code (first 6 characters of an MD5 of the tracker ID) gets the guess_name of its tracker.
Trackers with no guess get a name picked from the list by their code, so the same boat always gets the same name.

Output: boat-names.json, {code: name}. No tracker ID is written.
"""
import csv
import hashlib

from common import RAW, write_json

SRC = RAW / "imei_name_guess_all.csv"

if __name__ == "__main__":
    with open(SRC, encoding="utf-8-sig") as f:
        rows = [(hashlib.md5(r["imei"].encode()).hexdigest()[:6].upper(), r["guess_name"].strip()) for r in csv.DictReader(f)]
    pool = sorted({n for _, n in rows if n})
    names = {code: name or pool[int(code, 16) % len(pool)] for code, name in sorted(rows)}
    write_json("boat-names.json", names)
    print(f"{len(names)} boats named, {sum(1 for _, n in rows if not n)} picked from the list")
