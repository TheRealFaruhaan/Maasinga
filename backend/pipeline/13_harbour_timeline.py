"""Step 13: a timeline per North Harbour boat: distance from Male over August, calls, trips and the next trip.

For every boat in harbour.json (boats that stayed in the North Harbour area):
- km: distance from Male every 30 minutes (local time, from 1 Aug 00:00). A boat that sends no position keeps its last
  distance for up to 6 hours (it is lying still); after that the slot is null (no GPS).
- stops: every stop (10 minutes or more under 1.5 knots, step 4) with the place, whether it is in the Male area (within
  15 km of Male: Male City, Thilafushi, Gulhifalhu) and whether it is inside the North Harbour outline.
- trips: each time the boat left the Male area and came back (a stop outside it, or 15 km or more from Male, in between).
- projection: the next departure from Male and the return, from the boat's median time in Male between trips and its
  median trip length. Only for boats with 2 or more trips. It is a projection after the last day of data (31 Aug 2025).

Output: harbour-timelines.json (API only, policy login).
"""
import hashlib
import json
import math
import statistics
from datetime import datetime, timedelta

from common import OUT, REF, WORK, db, write_json

MALE = (4.174246, 73.509521)
STEP_MIN = 30
HOLD_H = 6
AWAY_KM = 15
T0 = datetime(2025, 8, 1)
SLOTS = 31 * 24 * 60 // STEP_MIN

poly = json.load(open(REF / "north_harbour.geojson"))["geometry"]["coordinates"][0]


def inside(x, y):
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def km(lat, lon):
    r = math.radians
    h = math.sin(r(lat - MALE[0]) / 2) ** 2 + math.cos(r(lat)) * math.cos(r(MALE[0])) * math.sin(r(lon - MALE[1]) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M")


if __name__ == "__main__":
    codes = {b["id"] for b in json.load(open(OUT / "harbour.json"))["boats"]}
    names = {p["id"]: p["name"] for p in json.load(open(OUT / "network.json"))["places"]}
    con = db()
    imeis = [i for (i,) in con.execute(f"select distinct imei from '{WORK / 'pings.parquet'}'").fetchall()
             if hashlib.md5(i.encode()).hexdigest()[:6].upper() in codes]
    con.execute("create table pick(imei varchar)")
    con.executemany("insert into pick values (?)", [(i,) for i in imeis])

    # Last position in every 30-minute slot.
    pos = {}
    for imei, slot, lat, lon in con.execute(f"""
        select p.imei, (epoch(p.t) - epoch(timestamp '{T0:%Y-%m-%d}')) // {STEP_MIN * 60} slot, arg_max(p.lat, p.t), arg_max(p.lon, p.t)
        from '{WORK / 'pings.parquet'}' p join pick using (imei) group by 1, 2""").fetchall():
        if 0 <= slot < SLOTS:
            pos.setdefault(imei, {})[int(slot)] = round(km(lat, lon), 1)

    stops = {}
    for imei, arr, dep, place, lat, lon in con.execute(f"""
        select s.imei, s.arr, s.dep, s.place, s.lat, s.lon from '{WORK / 'stops.parquet'}' s join pick using (imei) order by 1, 2""").fetchall():
        stops.setdefault(imei, []).append((arr, dep, place, lat, lon))

    out = {}
    for imei in imeis:
        code = hashlib.md5(imei.encode()).hexdigest()[:6].upper()
        series, last, last_slot = [], None, -10**9
        for s in range(SLOTS):
            if s in pos.get(imei, {}):
                last, last_slot = pos[imei][s], s
            series.append(last if last is not None and (s - last_slot) * STEP_MIN <= HOLD_H * 60 else None)

        st = [{"arr": iso(a), "dep": iso(d), "place": p, "name": names.get(p) if p else None,
               "male": km(lat, lon) < AWAY_KM, "harbour": inside(lon, lat), "km": round(km(lat, lon), 1),
               "minutes": round((d - a).total_seconds() / 60)} for a, d, p, lat, lon in stops.get(imei, [])]

        # Trips away from the Male area: from the end of a Male-area stop to the start of the next one.
        trips, prev = [], None
        for i, s in enumerate(st):
            if not s["male"]:
                continue
            if prev is not None:
                between = st[prev + 1:i]
                if between or max((k for k in series[int((datetime.fromisoformat(st[prev]["dep"]) - T0).total_seconds() // 1800):
                                                     int((datetime.fromisoformat(s["arr"]) - T0).total_seconds() // 1800)] if k is not None), default=0) >= AWAY_KM:
                    far = max(between, key=lambda b: b["km"]) if between else None
                    trips.append({"left": st[prev]["dep"], "back": s["arr"],
                                  "hours": round((datetime.fromisoformat(s["arr"]) - datetime.fromisoformat(st[prev]["dep"])).total_seconds() / 3600, 1),
                                  "calls": [b["place"] for b in between if b["place"]],
                                  "furthest": far["place"] if far else None, "furthest_km": far["km"] if far else None})
            prev = i

        projection = None
        if len(trips) >= 2:
            stay = statistics.median((datetime.fromisoformat(b["left"]) - datetime.fromisoformat(a["back"])).total_seconds() / 3600
                                     for a, b in zip(trips, trips[1:]))
            away = statistics.median(t["hours"] for t in trips)
            male_last = next((s for s in reversed(st) if s["male"]), None)
            if male_last and datetime.fromisoformat(male_last["arr"]) >= datetime.fromisoformat(trips[-1]["back"]):
                leave = datetime.fromisoformat(male_last["arr"]) + timedelta(hours=stay)
                projection = {"from": "in Male", "leaves": iso(leave), "back": iso(leave + timedelta(hours=away))}
            else:
                projection = {"from": "away", "leaves": None, "back": iso(datetime.fromisoformat(trips[-1]["back"]) + timedelta(hours=stay + away))}
            projection.update({"median_stay_in_male_h": round(stay, 1), "median_trip_h": round(away, 1), "based_on_trips": len(trips)})

        out[code] = {"t0": iso(T0), "step_min": STEP_MIN, "km": series, "stops": st, "trips": trips, "projection": projection}
    write_json("harbour-timelines.json", out)
    print(f"{len(out)} boats, {sum(len(v['trips']) for v in out.values())} trips, {sum(1 for v in out.values() if v['projection'])} projections")
