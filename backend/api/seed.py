"""Load the Maasinga data into PostgreSQL.

Reads the files the pipeline writes to data/out and fills the tables in
schema.sql. Safe to re-run: it drops and recreates the "maasinga" schema each time.

Usage: DATABASE_URL=postgresql://user:pass@host:5432/maasinga python seed.py [data dir]
"""
import json
import os
import sys
import time
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

from app.passwords import hash_password

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")  # api/.env, if present
DATA = Path(sys.argv[1] if len(sys.argv) > 1 else (os.environ.get("DATA_DIR") or HERE.parent / "data" / "out"))
DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("Set DATABASE_URL in api/.env or the environment (see api/.env.example)")


def read(name):
    with open(DATA / name) as f:
        return json.load(f)


def copy(cur, table, cols, rows):
    """Bulk insert with COPY: fast even for the 100k+ map cells."""
    with cur.copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as cp:
        for r in rows:
            cp.write_row(r)
    print(f"  {table}: {len(rows):,} rows")


def main():
    t0 = time.time()
    net, sea, safety, signal = read("network.json"), read("sea.json"), read("safety.json"), read("signal.json")
    harbour, paths, route_boats = read("harbour.json"), read("paths.json"), read("route-boats.json")
    extra = read("places-extra.json")

    with psycopg.connect(DB) as con, con.cursor() as cur:
        cur.execute((HERE / "schema.sql").read_text())
        # Logins live in their own schema and survive every seed. ADMIN_USERNAME/ADMIN_PASSWORD create the first admin once.
        cur.execute((HERE / "auth.sql").read_text())
        if os.environ.get("ADMIN_PASSWORD"):
            cur.execute("INSERT INTO auth.users (username, password_hash, role) VALUES (%s, %s, 'admin') ON CONFLICT (username) DO NOTHING",
                        (os.environ.get("ADMIN_USERNAME") or "admin", hash_password(os.environ["ADMIN_PASSWORD"])))
        cur.execute("SET search_path TO maasinga")

        meta = {
            "network.totals": net["totals"],
            "sea.sensors": sea["sensors"],
            "sea.pooled": sea["pooled"],
            "safety.summary": safety["summary"],
            "safety.crossingRates": safety["crossingRates"],
            "safety.fullSpeed.split": safety["fullSpeed"]["split"],
            "safety.seaStops": safety["seaStops"],
            "signal.total": signal["total"],
            "harbour.polygon": harbour["polygon"],
            "harbour.entered": harbour["entered"],
            "predict.eval": read("predict-eval.json"),
        }
        for label in ("calm", "rough"):
            rp = read(f"replay-{label}.json")
            meta[f"replay.{label}"] = {k: v for k, v in rp.items() if k != "segments"}
            copy(cur, "replay_segments", ["label", "ord", "boat_class", "times", "coords"],
                 [(label, i, s["c"], s["t"], s["p"]) for i, s in enumerate(rp["segments"])])
        copy(cur, "meta", ["key", "value"], [(k, Jsonb(v)) for k, v in meta.items()])

        copy(cur, "places", ["id", "kind", "name", "atoll", "lat", "lon", "pop", "boats", "region", "web_id", "name_dv"],
             [(p["id"], p["kind"], p["name"], p["atoll"], p["lat"], p["lon"], p["pop"], p["boats"],
               *(extra.get(p["id"], {}).get(k) for k in ("region", "web_id", "name_dv"))) for p in net["places"]])
        copy(cur, "routes", ["from_id", "to_id", "trips", "boats", "median_min", "late_pct", "main_type"],
             [(r["from"], r["to"], r["n"], r["boats"], r["mins"], r["latePct"], r["cls"]) for r in net["routes"]])
        copy(cur, "route_departures", ["from_id", "to_id", "time", "days"],
             [(r["from"], r["to"], t, d) for r in net["routes"] for t, d in r["usual"]])
        copy(cur, "route_hours", ["from_id", "to_id", "hour", "departures"],
             [(r["from"], r["to"], h, n) for r in net["routes"] for h, n in enumerate(r["hours"])])
        copy(cur, "route_paths", ["from_id", "to_id", "coords"],
             [(*k.split("|"), v) for k, v in paths.items()])
        copy(cur, "route_boats", ["from_id", "to_id", "boat_code", "boat_type", "trips", "median_min", "last_seen", "rank"],
             [(*k.split("|"), b[0], b[1], b[2], b[3], b[4], i) for k, v in route_boats.items() for i, b in enumerate(v)])
        copy(cur, "travel_index", ["code", "island", "atoll", "pop", "dep_week", "boats", "dests", "idx", "rank"],
             [(r["code"], r["island"], r["atoll"], r["pop"], r["depWeek"], r["boats"], r["dests"], r["index"], i) for i, r in enumerate(net["index"])])
        copy(cur, "daily_trips", ["day", "trips", "island_trips"], [(d["d"], d["n"], d["islands"]) for d in net["daily"]])

        copy(cur, "sea_regions", ["region", "name", "lat", "lon", "r_daily", "slope", "intercept", "r_gust", "days", "r_hourly", "hours", "rough_wave", "points"],
             [(k, r["name"], r["lat"], r["lon"], r["r_daily"], r["slope"], r["intercept"], r["r_gust"], r["days"], r["r_hourly"], r["hours"], sea["roughWave"][k],
               Jsonb(r.get("points", [[r["lat"], r["lon"]]])))
              for k, r in sea["regions"].items()])
        copy(cur, "sea_days", ["day", "region", "idx", "kn", "boats", "wave", "gust", "rain", "rough"],
             [(d["d"], k, v["idx"], v["kn"], v["boats"], v["wave"], v["gust"], v["rain"], v["rough"]) for d in sea["days"] for k, v in d["r"].items()])
        copy(cur, "sea_cells", ["day", "lon", "lat", "idx", "boats", "ord"],
             [(day, c[0], c[1], c[2], c[3], i) for day, cells in sea["cells"].items() for i, c in enumerate(cells)])

        copy(cur, "safety_days", ["day", "trips", "crossings", "rough_crossings", "night_crossings"],
             [(d["d"], d["trips"], d["crossings"], d["roughCrossings"], d["nightCrossings"]) for d in safety["days"]])
        copy(cur, "rough_routes", ["rank", "from_id", "to_id", "region", "trips", "days", "night", "max_wave", "from_lon", "from_lat", "to_lon", "to_lat"],
             [(i, r["from"], r["to"], r["region"], r["n"], r["days"], r["night"], r["maxWave"], *r["path"][0], *r["path"][1]) for i, r in enumerate(safety["roughRoutes"])])
        copy(cur, "fullspeed_boats", ["rank", "boat_code", "region", "rough_days", "idx", "max_wave"],
             [(i, b["id"], b["region"], b["roughDays"], b["idx"], b["maxWave"]) for i, b in enumerate(safety["fullSpeed"]["boats"])])

        copy(cur, "signal_cells", ["ord", "lon", "lat", "late_pct", "positions", "boats"], [(i, *c) for i, c in enumerate(signal["cells"])])
        copy(cur, "dead_zones", ["rank", "name", "cells", "km", "boats", "late_pct", "lon", "lat"],
             [(i, z["name"], z["cells"], z["km"], z["boats"], z["latePct"], z["lon"], z["lat"]) for i, z in enumerate(signal["zones"])])
        copy(cur, "signal_worst", ["rank", "lat", "lon", "pct", "boats", "near", "atoll", "km"],
             [(i, w["lat"], w["lon"], w["pct"], w["boats"], w["near"], w["atoll"], w["km"]) for i, w in enumerate(signal["worst"])])

        copy(cur, "harbour_boats", ["rank", "boat_code", "boat_type", "stays", "trips_in", "trips_aug", "median_min", "longest_min", "hours", "days", "day_list", "origins"],
             [(i, b["id"], b["type"], b["stays"], b["tripsIn"], b["tripsAug"], b["medianMin"], b["longestMin"], b["hours"], b["days"], b["dayList"], Jsonb(b["origins"]))
              for i, b in enumerate(harbour["boats"])])
        copy(cur, "harbour_origins", ["rank", "place_id", "name", "lat", "lon", "trips"],
             [(i, o["id"], o["name"], o["lat"], o["lon"], o["n"]) for i, o in enumerate(harbour["origins"])])
        copy(cur, "harbour_hours", ["hour", "arrivals"], list(enumerate(harbour["hours"])))
        copy(cur, "harbour_days", ["day", "boats"], [(d["d"], d["boats"]) for d in harbour["days"]])

        if (DATA / "boat-names.json").exists():
            copy(cur, "boat_names", ["code", "name"], list(read("boat-names.json").items()))

        # Slot = start of the 15-minute window, the same rule as the usual departures.
        copy(cur, "trips", ["boat_code", "from_id", "to_id", "dep", "minutes", "slot"],
             [(c, a, b, d, m, f"{d[11:13]}:{int(d[14:16]) // 15 * 15:02d}") for c, a, b, d, m in read("trips.json")])
        copy(cur, "boats", ["code", "name", "type", "kind", "operator", "home", "trips", "routes", "days", "first_day", "last_day"],
             [(b["code"], b["name"], b["type"], b["kind"], b["operator"], b["home"], b["trips"], b["routes"], b["days"], b["first"], b["last"])
              for b in read("boats.json")])
        weather = read("weather.json")
        copy(cur, "weather_hourly", ["region", "t", "wave", "gust"], [(k, *h) for k, w in weather.items() for h in w["hourly"]])
        copy(cur, "weather_daily", ["region", "day", "wave", "gust", "rain"], [(k, *d) for k, w in weather.items() for d in w["daily"]])

        copy(cur, "contacts", ["place_id", "category", "name", "phone", "ord"],
             [(pid, cat, c["name"], c["phone"], i) for pid, cats in read("contacts.json").items() for cat, cs in cats.items() for i, c in enumerate(cs)])

        copy(cur, "harbour_timelines", ["code", "data"], [(c, Jsonb(v)) for c, v in read("harbour-timelines.json").items()])

        info = json.loads((HERE / "info.json").read_text())
        copy(cur, "airport_taxi_fares", ["to_en", "to_dv", "place_id", "car_mvr", "van_mvr", "ord"],
             [(f["to_en"], f["to_dv"], f["place_id"], f["car_mvr"], f["van_mvr"], i) for i, f in enumerate(info["airport_taxi_fares"])])
        copy(cur, "hotlines", ["id", "category", "number", "name_en", "name_dv", "ord"],
             [(h["id"], h["category"], h["number"], h["name_en"], h["name_dv"], i) for i, h in enumerate(info["hotlines"])])

        copy(cur, "bus_routes", ["code", "from_en", "from_dv", "to_en", "to_dv", "fare_mvr", "every_min", "hours", "color", "ord"],
             [(b["code"], b["from"]["en"], b["from"]["dv"], b["to"]["en"], b["to"]["dv"], b["fare_mvr"], b["every_min"], b["hours"], b["color"], i)
              for i, b in enumerate(info["bus_routes"])])
        bus = read("bus.json")
        copy(cur, "bus_ridership", ["period", "at", "route", "paid", "foc", "total"],
             [("month", *r) for r in bus["monthly"]] + [("day", *r) for r in bus["daily"]])

        apps = json.loads((HERE / "apps.json").read_text())["apps"]
        copy(cur, "apps", ["id", "category", "name", "name_dv", "blurb_en", "blurb_dv", "color", "initials", "icon", "ios_url",
                           "android_package", "web_url", "hotline", "places", "ord"],
             [(a["id"], a["category"], a["name"], a["name_dv"], a["blurb"]["en"], a["blurb"]["dv"], a["color"], a["initials"], a["icon"],
               a["iosUrl"], a["androidPackage"], a["webUrl"], a["hotline"], a["places"], i) for i, a in enumerate(apps)])

        copy(cur, "map_layers", ["name", "geojson"], [(n, Jsonb(read(f"{n}.json"))) for n in ("land", "reefs")])
        con.commit()
    print(f"Seeded {DB.rsplit('@', 1)[-1]} from {DATA} in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
