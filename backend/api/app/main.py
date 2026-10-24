"""Maasinga API: serves the Maldives sea-mobility data from PostgreSQL.

Two kinds of endpoint:
- Dataset endpoints (/network, /sea, /safety, /signal, /harbour, /paths, /route-boats, /replay/*, /map/*)
  return whole datasets in the shape the dashboard uses.
- Query and app endpoints (/places, /routes, /boats, /trips, /weather, /forecast) answer one question for other apps.
  Full guide with example responses: docs/API.md

The data changes only when seed.py runs, so each dataset is built once and kept in memory.
Interactive docs: /docs
"""
import json
import os
import time
import urllib.request
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from psycopg.rows import dict_row
from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))  # api/.env, if present

DB = os.environ.get("DATABASE_URL")
if not DB:
    raise RuntimeError("Set DATABASE_URL in api/.env or the environment (see api/.env.example)")
ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

pool = ConnectionPool(DB, min_size=1, max_size=8, kwargs={"options": "-c search_path=maasinga"}, open=False)


@asynccontextmanager
async def lifespan(_app):
    pool.open()
    yield
    pool.close()


app = FastAPI(
    lifespan=lifespan,
    title="Maasinga API",
    version="1.0.0",
    description="Maldives sea mobility from 1,776 boat GPS trackers (FollowMe, August 2025), "
    "with ERA5 and NASA IMERG weather, MBS Census 2022 and OpenStreetMap. Boat IDs are coded. Guide: docs/API.md",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def rows(sql, *args):
    with pool.connection() as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def meta(key):
    r = rows("SELECT value FROM meta WHERE key = %s", key)
    return r[0]["value"] if r else None


def day(d):
    return d.isoformat()


# ---------- Health ----------


@app.get("/health", tags=["status"])
def health():
    """The API is up and the database answers."""
    n = rows("SELECT count(*) AS n FROM routes")[0]["n"]
    return {"ok": True, "routes": n}


# ---------- Dataset endpoints (same shapes as the dashboard files) ----------


@app.get("/network", tags=["datasets"])
@lru_cache
def network():
    """Places, routes with usual departures and hourly departures, Travel Index, trips per day."""
    deps, hours = {}, {}
    for r in rows("SELECT from_id, to_id, time, days FROM route_departures ORDER BY from_id, to_id, time"):
        deps.setdefault((r["from_id"], r["to_id"]), []).append([r["time"], r["days"]])
    for r in rows("SELECT from_id, to_id, hour, departures FROM route_hours ORDER BY from_id, to_id, hour"):
        hours.setdefault((r["from_id"], r["to_id"]), []).append(r["departures"])
    return {
        "places": rows("SELECT id, kind, lat, lon, boats, name, atoll, pop FROM places"),
        "routes": [
            {"from": r["from_id"], "to": r["to_id"], "n": r["trips"], "boats": r["boats"], "mins": r["median_min"],
             "latePct": r["late_pct"], "cls": r["main_type"], "usual": deps.get((r["from_id"], r["to_id"]), []),
             "hours": hours.get((r["from_id"], r["to_id"]), [])}
            for r in rows("SELECT * FROM routes")
        ],
        "index": [
            {"code": r["code"], "island": r["island"], "atoll": r["atoll"], "pop": r["pop"], "depWeek": r["dep_week"],
             "boats": r["boats"], "dests": r["dests"], "index": r["idx"]}
            for r in rows("SELECT * FROM travel_index ORDER BY rank")
        ],
        "daily": [{"d": day(r["day"]), "n": r["trips"], "islands": r["island_trips"]} for r in rows("SELECT * FROM daily_trips ORDER BY day")],
        "totals": meta("network.totals"),
    }


@app.get("/paths", tags=["datasets"])
@lru_cache
def paths():
    """Typical GPS track of each route: {"FROM|TO": [lon, lat, ...]} in degrees x 10,000."""
    return {f"{r['from_id']}|{r['to_id']}": r["coords"] for r in rows("SELECT from_id, to_id, coords FROM route_paths")}


@app.get("/route-boats", tags=["datasets"])
@lru_cache
def route_boats():
    """Boats on each route: {"FROM|TO": [[code, type, trips, median minutes, last day], ...]}."""
    out = {}
    for r in rows("SELECT * FROM route_boats ORDER BY from_id, to_id, rank"):
        out.setdefault(f"{r['from_id']}|{r['to_id']}", []).append([r["boat_code"], r["boat_type"], r["trips"], r["median_min"], day(r["last_seen"])])
    return out


@app.get("/sea", tags=["datasets"])
@lru_cache
def sea():
    """Sea Pace Index: boat speed against waves, per region, day and map cell."""
    regions = rows("SELECT * FROM sea_regions")
    days = {}
    for r in rows("SELECT * FROM sea_days ORDER BY day, region"):
        days.setdefault(day(r["day"]), {"d": day(r["day"]), "r": {}})["r"][r["region"]] = {
            "idx": r["idx"], "kn": r["kn"], "boats": r["boats"], "wave": r["wave"], "gust": r["gust"], "rain": r["rain"], "rough": r["rough"]}
    cells = {}
    for r in rows("SELECT * FROM sea_cells ORDER BY day, ord"):
        cells.setdefault(day(r["day"]), []).append([r["lon"], r["lat"], r["idx"], r["boats"]])
    return {
        "sensors": meta("sea.sensors"),
        "regions": {
            r["region"]: {"name": r["name"], "lat": r["lat"], "lon": r["lon"], "points": r["points"], "r_daily": r["r_daily"], "slope": r["slope"],
                          "intercept": r["intercept"], "r_gust": r["r_gust"], "days": r["days"], "r_hourly": r["r_hourly"], "hours": r["hours"]}
            for r in regions
        },
        "pooled": meta("sea.pooled"),
        "roughWave": {r["region"]: r["rough_wave"] for r in regions},
        "days": list(days.values()),
        "cells": cells,
    }


@app.get("/safety", tags=["datasets"])
@lru_cache
def safety():
    """Crossings between atolls in rough sea, and speedboats that kept full speed."""
    return {
        "summary": meta("safety.summary"),
        "days": [{"d": day(r["day"]), "trips": r["trips"], "crossings": r["crossings"], "roughCrossings": r["rough_crossings"],
                  "nightCrossings": r["night_crossings"]} for r in rows("SELECT * FROM safety_days ORDER BY day")],
        "roughRoutes": [
            {"from": r["from_id"], "to": r["to_id"], "region": r["region"], "n": r["trips"], "days": r["days"], "night": r["night"],
             "maxWave": r["max_wave"], "path": [[r["from_lon"], r["from_lat"]], [r["to_lon"], r["to_lat"]]]}
            for r in rows("SELECT * FROM rough_routes ORDER BY rank")
        ],
        "crossingRates": meta("safety.crossingRates"),
        "fullSpeed": {
            "split": meta("safety.fullSpeed.split"),
            "boats": [{"id": r["boat_code"], "region": r["region"], "roughDays": r["rough_days"], "idx": r["idx"], "maxWave": r["max_wave"]}
                      for r in rows("SELECT * FROM fullspeed_boats ORDER BY rank")],
        },
        "seaStops": meta("safety.seaStops"),
    }


@app.get("/signal", tags=["datasets"])
@lru_cache
def signal():
    """Where boats lose phone signal: sea cells, dead zones and the worst cells."""
    return {
        "cells": [[r["lon"], r["lat"], r["late_pct"], r["positions"], r["boats"]] for r in rows("SELECT * FROM signal_cells ORDER BY ord")],
        "zones": [{"name": r["name"], "cells": r["cells"], "km": r["km"], "boats": r["boats"], "latePct": r["late_pct"], "lon": r["lon"], "lat": r["lat"]}
                  for r in rows("SELECT * FROM dead_zones ORDER BY rank")],
        "worst": [{"lat": r["lat"], "lon": r["lon"], "pct": r["pct"], "boats": r["boats"], "near": r["near"], "atoll": r["atoll"], "km": r["km"]}
                  for r in rows("SELECT * FROM signal_worst ORDER BY rank")],
        "total": meta("signal.total"),
    }


@app.get("/harbour", tags=["datasets"])
@lru_cache
def harbour():
    """Male North Harbour: boats, stays, arrivals and where they came from."""
    return {
        "polygon": meta("harbour.polygon"),
        "boats": [
            {"id": r["boat_code"], "type": r["boat_type"], "stays": r["stays"], "tripsIn": r["trips_in"], "tripsAug": r["trips_aug"],
             "medianMin": r["median_min"], "longestMin": r["longest_min"], "hours": r["hours"], "days": r["days"], "dayList": r["day_list"],
             "origins": r["origins"]}
            for r in rows("SELECT * FROM harbour_boats ORDER BY rank")
        ],
        "entered": meta("harbour.entered"),
        "origins": [{"id": r["place_id"], "name": r["name"], "lat": r["lat"], "lon": r["lon"], "n": r["trips"]}
                    for r in rows("SELECT * FROM harbour_origins ORDER BY rank")],
        "hours": [r["arrivals"] for r in rows("SELECT * FROM harbour_hours ORDER BY hour")],
        "days": [{"d": day(r["day"]), "boats": r["boats"]} for r in rows("SELECT * FROM harbour_days ORDER BY day")],
    }


@lru_cache
def _replay(label):
    info = meta(f"replay.{label}")
    if not info:
        raise HTTPException(404, f"No replay called {label}")
    segs = rows("SELECT boat_class, times, coords FROM replay_segments WHERE label = %s ORDER BY ord", label)
    return {**info, "segments": [{"c": s["boat_class"], "t": s["times"], "p": s["coords"]} for s in segs]}


@app.get("/replay/{label}", tags=["datasets"])
def replay(label: str):
    """Every moving boat on the calm day (calm) or the rough day (rough): paths with times."""
    return _replay(label)


@app.get("/boat-names", tags=["datasets"])
@lru_cache
def boat_names():
    """Display name for each coded boat, {code: name}. Demo only: names are best guesses from the team's list."""
    return {r["code"]: r["name"] for r in rows("SELECT code, name FROM boat_names ORDER BY code")}


@lru_cache
def _layer(name):
    r = rows("SELECT geojson FROM map_layers WHERE name = %s", name)
    if not r:
        raise HTTPException(404, f"No map layer called {name}")
    return r[0]["geojson"]


@app.get("/map/{name}", tags=["datasets"])
def map_layer(name: str):
    """Base map from OpenStreetMap as GeoJSON: land (island outlines) or reefs."""
    return _layer(name)


# ---------- Query endpoints ----------


@app.get("/places", tags=["queries"])
def places(kind: str | None = Query(None, description="island or site")):
    """Islands and sites where boats stop."""
    return rows("SELECT * FROM places WHERE %s::text IS NULL OR kind = %s ORDER BY name", kind, kind)


@app.get("/routes", tags=["queries"])
def routes(
    from_id: str | None = Query(None, alias="from", description="Place id it leaves from, for example K.Maafushi"),
    to_id: str | None = Query(None, alias="to", description="Place id it goes to, for example MLE.Male"),
):
    """Routes, busiest first. Filter by the place they leave from, the place they go to, or both."""
    return rows(
        "SELECT r.*, f.name AS from_name, t.name AS to_name FROM routes r JOIN places f ON f.id = r.from_id JOIN places t ON t.id = r.to_id "
        "WHERE (%s::text IS NULL OR r.from_id = %s) AND (%s::text IS NULL OR r.to_id = %s) ORDER BY r.trips DESC",
        from_id, from_id, to_id, to_id,
    )


def arrives(time, minutes):
    """ "HH:MM" plus minutes, on a 24-hour clock."""
    m = (int(time[:2]) * 60 + int(time[3:]) + round(minutes or 0)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def slot_boats(where, *args, top=3):
    """Boats that left in each usual departure slot: {(from, to, time): [{code, name, type, days}, ...]}, most days first."""
    out = {}
    for r in rows(
        "SELECT t.from_id, t.to_id, t.slot, t.boat_code, b.name, b.type, count(DISTINCT t.dep::date) AS days "
        "FROM trips t JOIN route_departures d ON d.from_id = t.from_id AND d.to_id = t.to_id AND d.time = t.slot "
        f"JOIN boats b ON b.code = t.boat_code WHERE {where} GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 1, 2, 3, 7 DESC, 4",
        *args,
    ):
        lst = out.setdefault((r["from_id"], r["to_id"], r["slot"]), [])
        if len(lst) < top:
            lst.append({"code": r["boat_code"], "name": r["name"], "type": r["type"], "days": r["days"]})
    return out


@app.get("/routes/{from_id}/{to_id}", tags=["queries"])
def route(from_id: str, to_id: str):
    """One route: usual departures (with arrival time and the boats that run them), departures by hour, boats, typical track."""
    r = rows(
        "SELECT r.*, f.name AS from_name, t.name AS to_name FROM routes r JOIN places f ON f.id = r.from_id JOIN places t ON t.id = r.to_id "
        "WHERE r.from_id = %s AND r.to_id = %s", from_id, to_id)
    if not r:
        raise HTTPException(404, "No route between these places")
    sb = slot_boats("t.from_id = %s AND t.to_id = %s", from_id, to_id)
    return {
        **r[0],
        "departures": [
            {"time": d["time"], "arrives": arrives(d["time"], r[0]["median_min"]), "days": d["days"], "boats": sb.get((from_id, to_id, d["time"]), [])}
            for d in rows("SELECT time, days FROM route_departures WHERE from_id = %s AND to_id = %s ORDER BY time", from_id, to_id)
        ],
        "hours": [x["departures"] for x in rows("SELECT departures FROM route_hours WHERE from_id = %s AND to_id = %s ORDER BY hour", from_id, to_id)],
        "boats": rows(
            "SELECT rb.boat_code, b.name AS boat_name, rb.boat_type, b.kind AS boat_kind, rb.trips, rb.median_min, rb.last_seen "
            "FROM route_boats rb LEFT JOIN boats b ON b.code = rb.boat_code WHERE rb.from_id = %s AND rb.to_id = %s ORDER BY rb.rank",
            from_id, to_id),
        "path": (rows("SELECT coords FROM route_paths WHERE from_id = %s AND to_id = %s", from_id, to_id) or [{"coords": []}])[0]["coords"],
    }


# ---------- App endpoints (places, schedules, boats, trips, weather, forecast) ----------


def place_or_404(pid):
    p = rows("SELECT * FROM places WHERE id = %s", pid)
    if not p:
        raise HTTPException(404, f"No place called {pid}")
    return p[0]


@app.get("/places/{place_id}", tags=["app"])
def place(place_id: str):
    """One place: details, routes leaving and arriving, boats based here, and its sea region."""
    p = place_or_404(place_id)
    route_sql = (
        "SELECT r.from_id, f.name AS from_name, r.to_id, t.name AS to_name, r.trips, r.boats, r.median_min, r.main_type, "
        "(SELECT count(*) FROM route_departures d WHERE d.from_id = r.from_id AND d.to_id = r.to_id) AS usual_departures "
        "FROM routes r JOIN places f ON f.id = r.from_id JOIN places t ON t.id = r.to_id WHERE r.{} = %s ORDER BY r.trips DESC"
    )
    region = rows("SELECT region, name, rough_wave FROM sea_regions WHERE region = %s", p["region"]) if p["region"] else []
    return {
        **p,
        "sea_region": region[0] if region else None,
        "routes_from": rows(route_sql.format("from_id"), place_id),
        "routes_to": rows(route_sql.format("to_id"), place_id),
        "boats_based": rows("SELECT code, name, type, kind, operator, trips FROM boats WHERE home = %s ORDER BY trips DESC, code", place_id),
    }


@app.get("/places/{place_id}/schedule", tags=["app"])
def schedule(place_id: str):
    """Departure and arrival board of one place: every usual departure from it and every usual arrival at it, by time,
    with the boats that usually run it."""
    place_or_404(place_id)
    sb = slot_boats("(t.from_id = %s OR t.to_id = %s)", place_id, place_id)
    board = rows(
        "SELECT d.from_id, f.name AS from_name, d.to_id, t.name AS to_name, d.time, d.days, r.median_min, r.main_type "
        "FROM route_departures d JOIN routes r USING (from_id, to_id) JOIN places f ON f.id = d.from_id JOIN places t ON t.id = d.to_id "
        "WHERE d.from_id = %s OR d.to_id = %s", place_id, place_id)
    def item(d):
        return {"departs": d["time"], "arrives": arrives(d["time"], d["median_min"]), "from_id": d["from_id"], "from_name": d["from_name"],
                "to_id": d["to_id"], "to_name": d["to_name"], "days": d["days"], "median_min": d["median_min"], "main_type": d["main_type"],
                "boats": sb.get((d["from_id"], d["to_id"], d["time"]), [])}
    return {
        "place": place_id,
        "departures": sorted((item(d) for d in board if d["from_id"] == place_id), key=lambda x: (x["departs"], x["to_id"])),
        "arrivals": sorted((item(d) for d in board if d["to_id"] == place_id), key=lambda x: (x["arrives"], x["from_id"])),
    }


@app.get("/boats", tags=["app"])
def boats(
    type: str | None = Query(None, description="fast, dhoni or slow"),
    home: str | None = Query(None, description="Place id the boat is based at"),
    place: str | None = Query(None, description="Place id the boat made trips from or to"),
    q: str | None = Query(None, description="Part of the boat name or code"),
    limit: int = Query(100, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    """Boats, most trips first."""
    return rows(
        "SELECT b.*, p.name AS home_name FROM boats b LEFT JOIN places p ON p.id = b.home "
        "WHERE (%s::text IS NULL OR b.type = %s) AND (%s::text IS NULL OR b.home = %s) "
        "AND (%s::text IS NULL OR b.code IN (SELECT boat_code FROM trips WHERE from_id = %s OR to_id = %s)) "
        "AND (%s::text IS NULL OR b.name ILIKE '%%' || %s || '%%' OR b.code ILIKE %s || '%%') "
        "ORDER BY b.trips DESC, b.code LIMIT %s OFFSET %s",
        type, type, home, home, place, place, place, q, q, q, limit, offset,
    )


@app.get("/boats/{code}", tags=["app"])
def boat(code: str):
    """One boat: details, the routes it runs with its usual times, trips per day, and its last 20 trips."""
    code = code.upper()
    b = rows("SELECT b.*, p.name AS home_name FROM boats b LEFT JOIN places p ON p.id = b.home WHERE b.code = %s", code)
    if not b:
        raise HTTPException(404, f"No boat with code {code}")
    times = {}
    # A boat's usual time on a route: a 15-minute slot it used on 3 or more days.
    for r in rows("SELECT from_id, to_id, slot, count(DISTINCT dep::date) AS days FROM trips WHERE boat_code = %s "
                  "GROUP BY 1, 2, 3 HAVING count(DISTINCT dep::date) >= 3 ORDER BY 1, 2, 3", code):
        times.setdefault((r["from_id"], r["to_id"]), []).append({"time": r["slot"], "days": r["days"]})
    routes_ = rows(
        "SELECT t.from_id, f.name AS from_name, t.to_id, p.name AS to_name, count(*) AS trips, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes)) AS median_min, "
        "to_char(max(t.dep), 'YYYY-MM-DD') AS last_day FROM trips t JOIN places f ON f.id = t.from_id JOIN places p ON p.id = t.to_id "
        "WHERE t.boat_code = %s GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC, 1, 3", code)
    return {
        **b[0],
        "routes": [{**r, "usual": times.get((r["from_id"], r["to_id"]), [])} for r in routes_],
        "daily": rows("SELECT to_char(dep, 'YYYY-MM-DD') AS d, count(*) AS trips FROM trips WHERE boat_code = %s GROUP BY 1 ORDER BY 1", code),
        "recent": trips(from_id=None, to_id=None, boat=code, date=None, limit=20, offset=0, latest=True),
    }


@app.get("/trips", tags=["app"])
def trips(
    from_id: str | None = Query(None, alias="from", description="Place id it left from"),
    to_id: str | None = Query(None, alias="to", description="Place id it went to"),
    boat: str | None = Query(None, description="Boat code"),
    date: str | None = Query(None, description="Day, YYYY-MM-DD (August 2025)"),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    latest: bool = Query(False, description="Newest first"),
):
    """Real trips made in August 2025, in departure order. Combine any filters."""
    return rows(
        "SELECT t.boat_code, b.name AS boat_name, b.type AS boat_type, t.from_id, f.name AS from_name, t.to_id, p.name AS to_name, "
        "to_char(t.dep, 'YYYY-MM-DD\"T\"HH24:MI') AS departs, to_char(t.dep + t.minutes * interval '1 minute', 'YYYY-MM-DD\"T\"HH24:MI') AS arrives, t.minutes "
        "FROM trips t JOIN boats b ON b.code = t.boat_code JOIN places f ON f.id = t.from_id JOIN places p ON p.id = t.to_id "
        "WHERE (%s::text IS NULL OR t.from_id = %s) AND (%s::text IS NULL OR t.to_id = %s) AND (%s::text IS NULL OR t.boat_code = upper(%s)) "
        "AND (%s::date IS NULL OR t.dep >= %s::date AND t.dep < %s::date + 1) "
        f"ORDER BY t.dep {'DESC' if latest else 'ASC'}, t.boat_code LIMIT %s OFFSET %s",
        from_id, from_id, to_id, to_id, boat, boat, date, date, date, limit, offset,
    )


@app.get("/weather", tags=["app"])
def weather(
    region: str | None = Query(None, description="north, central, midsouth or south"),
    place: str | None = Query(None, description="Place id; uses its sea region"),
):
    """Daily weather per sea region in August 2025: highest wave (m), strongest gust (kn), rain (mm),
    with how fast boats ran that day (idx, 1.00 = normal) and whether it was a rough day."""
    if place:
        region = place_or_404(place)["region"]
    return rows(
        "SELECT w.region, to_char(w.day, 'YYYY-MM-DD') AS d, w.wave, w.gust, w.rain, s.idx, s.rough "
        "FROM weather_daily w LEFT JOIN sea_days s ON s.day = w.day AND s.region = w.region "
        "WHERE %s::text IS NULL OR w.region = %s ORDER BY w.region, w.day", region, region)


@app.get("/weather/{region}/{date}", tags=["app"])
def weather_hours(region: str, date: str):
    """Hourly waves (m) and gusts (kn) for one sea region and day (YYYY-MM-DD, August 2025)."""
    r = rows("SELECT to_char(t, 'HH24:MI') AS time, wave, gust FROM weather_hourly WHERE region = %s AND t >= %s::date AND t < %s::date + 1 ORDER BY t",
             region, date, date)
    if not r:
        raise HTTPException(404, "No weather for this region and day")
    return r


_forecast_cache: dict = {}


@app.get("/forecast", tags=["app"])
def forecast(
    region: str | None = Query(None, description="north, central, midsouth or south"),
    place: str | None = Query(None, description="Place id; uses its sea region"),
):
    """Live wave forecast for today and the next 2 days (Open-Meteo Marine, highest wave over the region's points),
    rated with the boat-speed model: calm (boats under 5% slower than on a calm day), choppy (5 to 10%), rough (over 10%)."""
    if place:
        region = place_or_404(place)["region"]
    fit = rows("SELECT region, name, slope, points FROM sea_regions WHERE region = %s", region)
    if not fit:
        raise HTTPException(404, "Give a region (north, central, midsouth, south) or a place")
    fit = fit[0]
    hit = _forecast_cache.get(region)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    waves = sorted(r["wave"] for r in rows("SELECT wave FROM sea_days WHERE region = %s", region))
    calm = waves[int(len(waves) * 0.25)]
    pts = fit["points"]
    url = ("https://marine-api.open-meteo.com/v1/marine?latitude=" + ",".join(str(p[0]) for p in pts) + "&longitude=" + ",".join(str(p[1]) for p in pts)
           + "&daily=wave_height_max&timezone=Indian%2FMaldives&forecast_days=3")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "maasinga-api"}), timeout=10) as res:
            j = json.load(res)
    except Exception as e:
        raise HTTPException(502, f"Forecast service did not answer: {e}")
    j = j if isinstance(j, list) else [j]
    days = []
    for i, d in enumerate(j[0]["daily"]["time"]):
        wave = max((x["daily"]["wave_height_max"][i] or 0) for x in j)
        loss = max(0.0, -fit["slope"] * (wave - calm) * 100)
        days.append({"d": d, "wave": round(wave, 2), "loss_pct": round(loss, 1), "rating": "calm" if loss < 5 else "choppy" if loss < 10 else "rough"})
    out = {"region": region, "name": fit["name"], "calm_wave": calm, "days": days, "source": "Open-Meteo Marine forecast"}
    _forecast_cache[region] = (time.time(), out)
    return out
