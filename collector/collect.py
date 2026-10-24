#!/usr/bin/env python3
"""Poll local.port.mv's public portal API and record the vessel queue and
berth state over time in SQLite, so berthing times can be predicted later.

The portal keeps no history, so this is the history.

Tables
  polls          one row per poll per endpoint (coverage, errors, content hash)
  raw            full JSON body, stored only when it changed (dedup by hash)
  queue_listing  normalised queue positions, one row per vessel per changed snapshot
  berth          normalised zone occupancy, one row per vessel per changed snapshot
  movement       mnh-movements rows (BerthingDate, ExpectedDeparture) per changed snapshot
  event          derived changes: queue_join, queue_leave, queue_move, status_change,
                 given_change, zone_enter, zone_leave

Times we write are UTC ISO-8601. Times from the portal (BerthingDate, held_at,
ExpectedDeparture) are kept as given; they are Maldives local time (UTC+5).
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import signal
import sqlite3
import sys
import time
import urllib.request

BASE = "https://local.port.mv"
ENDPOINTS = {
    "queue": "/api/portal/vessel-queue",
    "berthed": "/api/portal/vessels-berthed",
    "mnh": "/api/portal/mnh-movements",
}
UA = "maasinga-collector/1.0 (research; polls every few minutes)"

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS polls(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, endpoint TEXT NOT NULL,
  ok INTEGER NOT NULL, http_status INTEGER, ms INTEGER, hash TEXT,
  changed INTEGER, error TEXT);
CREATE INDEX IF NOT EXISTS polls_ep_ts ON polls(endpoint, ts);
CREATE TABLE IF NOT EXISTS raw(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, endpoint TEXT NOT NULL,
  hash TEXT NOT NULL, body_gz BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS raw_ep_ts ON raw(endpoint, ts);
CREATE TABLE IF NOT EXISTS queue_listing(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, queue TEXT NOT NULL,
  position INTEGER NOT NULL, reg_no TEXT, name TEXT, status TEXT,
  given_zone TEXT, given_position TEXT, held_at TEXT,
  length REAL, breadth REAL);
CREATE INDEX IF NOT EXISTS ql_reg_ts ON queue_listing(reg_no, ts);
CREATE INDEX IF NOT EXISTS ql_ts ON queue_listing(ts);
CREATE TABLE IF NOT EXISTS berth(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, zone TEXT NOT NULL,
  zone_order INTEGER, berth_order INTEGER, orientation INTEGER,
  reg_no TEXT, name TEXT, length REAL, breadth REAL);
CREATE INDEX IF NOT EXISTS berth_reg_ts ON berth(reg_no, ts);
CREATE TABLE IF NOT EXISTS movement(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, name TEXT, quay TEXT,
  zone_order INTEGER, berthing_date TEXT, expected_departure TEXT,
  berthed_by TEXT);
CREATE INDEX IF NOT EXISTS mv_name_ts ON movement(name, ts);
CREATE TABLE IF NOT EXISTS event(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL,
  reg_no TEXT, name TEXT, queue TEXT, zone TEXT,
  old_value TEXT, new_value TEXT);
CREATE INDEX IF NOT EXISTS event_reg ON event(reg_no, ts);
CREATE INDEX IF NOT EXISTS event_kind_ts ON event(kind, ts);
"""

running = True


def log(*a):
    print(dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def now_utc():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch(path, timeout=30):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept": "application/json"})
    t0 = time.monotonic()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        return r.status, body, int((time.monotonic() - t0) * 1000)


def last_hash(db, ep):
    row = db.execute("SELECT hash FROM raw WHERE endpoint=? ORDER BY id DESC LIMIT 1", (ep,)).fetchone()
    return row[0] if row else None


# ---- normalisers: return list of rows -------------------------------------

def norm_queue(data):
    rows = []
    for g in data.get("data") or []:
        qname = (g.get("queue") or {}).get("name")
        for i, l in enumerate(g.get("listings") or [], 1):
            v = l.get("vessel") or {}
            gz = l.get("given_zone")
            if isinstance(gz, dict):
                gz = gz.get("name")
            rows.append(dict(queue=qname, position=i, reg_no=v.get("registration_no"), name=v.get("name"),
                             status=l.get("status_name"), given_zone=gz,
                             given_position=None if l.get("given_position") is None else str(l.get("given_position")),
                             held_at=l.get("held_at"), length=fnum(v.get("length")), breadth=fnum(v.get("breadth"))))
    return rows


def norm_berthed(data):
    rows = []
    for z in data.get("data") or []:
        zone = z.get("zone") or {}
        for vo in z.get("voyages") or []:
            v = vo.get("vessel") or {}
            rows.append(dict(zone=zone.get("name"), zone_order=zone.get("order"), berth_order=vo.get("order"),
                             orientation=vo.get("berth_orientation"), reg_no=v.get("registration_no"),
                             name=v.get("name"), length=fnum(v.get("length")), breadth=fnum(v.get("breadth"))))
    return rows


def norm_mnh(data):
    return [dict(name=x.get("VesselName"), quay=x.get("Quay"), zone_order=x.get("ZoneOrder"),
                 berthing_date=x.get("BerthingDate"), expected_departure=x.get("ExpectedDeparture"),
                 berthed_by=x.get("BerthedBy")) for x in (data if isinstance(data, list) else [])]


NORM = {"queue": ("queue_listing", norm_queue), "berthed": ("berth", norm_berthed), "mnh": ("movement", norm_mnh)}


def latest_rows(db, table, before_raw_id):
    """Rows of the previous stored snapshot for this table."""
    r = db.execute(f"SELECT MAX(raw_id) FROM {table} WHERE raw_id < ?", (before_raw_id,)).fetchone()
    if not r or r[0] is None:
        return None
    cur = db.execute(f"SELECT * FROM {table} WHERE raw_id=?", (r[0],))
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def key(r):
    return r.get("reg_no") or r.get("name")


def diff_queue(db, ts, prev, cur):
    ev = []
    p = {(key(r), r["queue"]): r for r in prev}
    c = {(key(r), r["queue"]): r for r in cur}
    for k, r in c.items():
        o = p.get(k)
        if o is None:
            ev.append(("queue_join", r, None, r["position"]))
            continue
        if o["position"] != r["position"]:
            ev.append(("queue_move", r, o["position"], r["position"]))
        if o["status"] != r["status"]:
            ev.append(("status_change", r, o["status"], r["status"]))
        if (o["given_zone"], o["given_position"]) != (r["given_zone"], r["given_position"]):
            ev.append(("given_change", r, f"{o['given_zone']}|{o['given_position']}", f"{r['given_zone']}|{r['given_position']}"))
    for k, o in p.items():
        if k not in c:
            ev.append(("queue_leave", o, o["position"], o["status"]))
    for kind, r, old, new in ev:
        db.execute("INSERT INTO event(ts,kind,reg_no,name,queue,old_value,new_value) VALUES(?,?,?,?,?,?,?)",
                   (ts, kind, r.get("reg_no"), r.get("name"), r.get("queue"), None if old is None else str(old), None if new is None else str(new)))
    return len(ev)


def diff_berth(db, ts, prev, cur):
    n = 0
    p = {key(r): r for r in prev}
    c = {key(r): r for r in cur}
    for k, r in c.items():
        o = p.get(k)
        if o is None or o["zone"] != r["zone"]:
            if o is not None:
                db.execute("INSERT INTO event(ts,kind,reg_no,name,zone,old_value,new_value) VALUES(?,?,?,?,?,?,?)",
                           (ts, "zone_leave", o["reg_no"], o["name"], o["zone"], o["zone"], r["zone"]))
                n += 1
            db.execute("INSERT INTO event(ts,kind,reg_no,name,zone,old_value,new_value) VALUES(?,?,?,?,?,?,?)",
                       (ts, "zone_enter", r["reg_no"], r["name"], r["zone"], o["zone"] if o else None, r["zone"]))
            n += 1
    for k, o in p.items():
        if k not in c:
            db.execute("INSERT INTO event(ts,kind,reg_no,name,zone,old_value,new_value) VALUES(?,?,?,?,?,?,?)",
                       (ts, "zone_leave", o["reg_no"], o["name"], o["zone"], o["zone"], None))
            n += 1
    return n


def poll_once(db):
    ts = now_utc()
    summary = []
    for ep, path in ENDPOINTS.items():
        try:
            status, body, ms = fetch(path)
            data = json.loads(body)
            h = hashlib.sha256(body).hexdigest()
            changed = h != last_hash(db, ep)
            with db:
                db.execute("INSERT INTO polls(ts,endpoint,ok,http_status,ms,hash,changed) VALUES(?,?,?,?,?,?,?)",
                           (ts, ep, 1, status, ms, h, int(changed)))
                nev = 0
                if changed:
                    cur = db.execute("INSERT INTO raw(ts,endpoint,hash,body_gz) VALUES(?,?,?,?)",
                                     (ts, ep, h, gzip.compress(body)))
                    raw_id = cur.lastrowid
                    table, fn = NORM[ep]
                    rows = fn(data)
                    for r in rows:
                        cols = ["raw_id", "ts"] + list(r.keys())
                        db.execute(f"INSERT INTO {table}({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                                   [raw_id, ts] + list(r.values()))
                    prev = latest_rows(db, table, raw_id)
                    if prev is not None:
                        if ep == "queue":
                            nev = diff_queue(db, ts, prev, rows)
                        elif ep == "berthed":
                            nev = diff_berth(db, ts, prev, rows)
            summary.append(f"{ep}:{'CHANGED' if changed else 'same'}{f' {nev}ev' if nev else ''}")
        except Exception as e:  # keep polling through network/API hiccups
            with db:
                db.execute("INSERT INTO polls(ts,endpoint,ok,error) VALUES(?,?,?,?)", (ts, ep, 0, repr(e)[:500]))
            summary.append(f"{ep}:ERR {e!r}"[:120])
    log(" ".join(summary))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "port.sqlite"))
    ap.add_argument("--interval", type=int, default=120, help="seconds between polls")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.db), exist_ok=True)
    db = sqlite3.connect(a.db)
    db.executescript(SCHEMA)

    def stop(*_):
        global running
        running = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log(f"collector start db={a.db} interval={a.interval}s")
    while running:
        t0 = time.monotonic()
        poll_once(db)
        if a.once:
            break
        while running and time.monotonic() - t0 < a.interval:
            time.sleep(1)
    db.close()
    log("collector stopped")


if __name__ == "__main__":
    sys.exit(main())
