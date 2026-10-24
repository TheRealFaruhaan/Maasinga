"""Step 11: extra data for apps that read the API (boats, every trip, weather, island links).

Outputs (in dashboard/public/data, loaded into the database by api/seed.py):
- trips.json: every trip in August, [boat code, from, to, departure "YYYY-MM-DDTHH:MM", minutes].
- boats.json: one row per boat: code, name, type, kind and operator (team name list), home place, trips, routes, days active.
- weather.json: per sea region, hourly waves and gusts and daily waves, gusts and rain (from pipeline/reference/weather).
- places-extra.json: per place: sea region, and for islands the id and Dhivehi name used by the team's web app.

The web app's island list (web/src/data/islands.json at the repo root) is matched to the census islands once and
kept in pipeline/reference/web_islands.csv, so later runs do not need the web folder.
"""
import csv
import difflib
import hashlib
import importlib
import json
import re

from common import OUT, RAW, REF, ROOT, WORK, db, write_json

REGIONS = importlib.import_module("02_weather").REGIONS
WEB_ISLANDS = ROOT.parent / "web" / "src" / "data" / "islands.json"
WEB_CSV = REF / "web_islands.csv"
NAMES_CSV = RAW / "imei_name_guess_all.csv"
MALE_CITY = {"Male": "MLE.Male", "Hulhumale": "MLE.Hulhumale", "Villimale": "MLE.Vilimale", "Hulhule": "MLE.Hulhule"}
BY_HAND = {("L", "Gan"): "L.Gamu"}  # the census lists Gan (Laamu) under its locality Gamu


def code(imei):
    return hashlib.md5(imei.encode()).hexdigest()[:6].upper()


def norm(s):
    """Spelling-proof key: the census drops the nasal "n" and doubles some vowels differently (Dhangethi = Dhagethi)."""
    s = s.lower().replace("ee", "i").replace("oa", "o").replace("aa", "a").replace("y", "i").replace("'", "")
    return re.sub(r"n(?=[^aeiou]|$)", "", s).replace("ll", "l").replace("dhdh", "dh")


def match_web_islands():
    web = json.load(open(WEB_ISLANDS))["islands"]
    census = list(csv.DictReader(open(REF / "islands.csv")))
    by_atoll = {}
    for c in census:
        by_atoll.setdefault(c["island_code"].split(".")[0], []).append(c)
    out = []
    for i in web:
        pid = MALE_CITY.get(i["name_en"]) if i["atoll"] == "K" else None
        pid = pid or BY_HAND.get((i["atoll"], i["name_en"]))
        if not pid:
            free = [c for c in by_atoll.get(i["atoll"], []) if c["island_code"] not in {o[1] for o in out}]
            hit = [c for c in free if c["island"].lower() == i["name_en"].lower()] or [c for c in free if norm(c["island"]) == norm(i["name_en"])]
            if not hit:
                keys = {norm(c["island"]): c for c in free}
                near = difflib.get_close_matches(norm(i["name_en"]), list(keys), 1, 0.75)
                hit = [keys[near[0]]] if near else []
            pid = hit[0]["island_code"] if hit else ""
        out.append((i["id"], pid, i["atoll"], i["name_en"], i["name_dv"]))
    with open(WEB_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["web_id", "place_id", "atoll", "name_en", "name_dv"])
        w.writerows(out)
    print(f"matched {sum(1 for o in out if o[1])} of {len(out)} web islands -> {WEB_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    if WEB_ISLANDS.exists():
        match_web_islands()
    con = db()

    # Every trip, in departure order.
    trips = con.execute(f"""
    select upper(substr(md5(imei), 1, 6)), from_place, to_place, strftime(dep, '%Y-%m-%dT%H:%M'), round(minutes)::int
    from '{WORK / 'trips.parquet'}' order by dep, 1, 2, 3
    """).fetchall()
    write_json("trips.json", [list(t) for t in trips])

    # Boats: activity from trips, home = the place it stopped at most (ties: alphabetical).
    rows = con.execute(f"""
    with t as (select * from '{WORK / 'trips.parquet'}'),
    home as (
      select imei, arg_max(place, (n, place)) home from (
        select imei, place, count(*) n from '{WORK / 'stops.parquet'}' where place is not null group by 1, 2) group by 1)
    select upper(substr(md5(t.imei), 1, 6)) code, arg_max(t.cls, (c.n, t.cls)) boat_type, any_value(h.home),
      count(*) n_trips, count(distinct (t.from_place, t.to_place)) n_routes, count(distinct t.dep::date) n_days,
      strftime(min(t.dep), '%Y-%m-%d'), strftime(max(t.dep), '%Y-%m-%d')
    from t join (select imei, cls, count(*) n from t group by 1, 2) c on c.imei = t.imei and c.cls = t.cls
    left join home h on h.imei = t.imei
    group by t.imei order by 1
    """).fetchall()
    names = json.load(open(OUT / "boat-names.json")) if (OUT / "boat-names.json").exists() else {}
    info = {}
    if NAMES_CSV.exists():
        with open(NAMES_CSV, encoding="utf-8-sig") as f:
            info = {code(r["imei"]): (r["followme_type"].strip() or None, r["operator"].strip() or None) for r in csv.DictReader(f)}
    write_json("boats.json", [
        {"code": c, "name": names.get(c, c), "type": t, "kind": info.get(c, (None, None))[0], "operator": info.get(c, (None, None))[1],
         "home": h, "trips": n, "routes": r, "days": d, "first": a, "last": b}
        for c, t, h, n, r, d, a, b in rows
    ])

    # Weather per region, from the committed reference files (already in local time).
    weather = {}
    for key in REGIONS:
        w = json.load(open(REF / "weather" / f"{key}.json"))
        mh, wh = w["marine"]["hourly"], w["weather"]["hourly"]
        md, wd = w["marine"]["daily"], w["weather"]["daily"]
        weather[key] = {
            "hourly": [[t, mh["wave_height"][i], wh["wind_gusts_10m"][i]] for i, t in enumerate(mh["time"])],
            "daily": [[d, md["wave_height_max"][i], wd["wind_gusts_10m_max"][i], wd["precipitation_sum"][i]] for i, d in enumerate(md["time"])],
        }
    write_json("weather.json", weather)

    # Sea region of every place, plus the web app's island id and Dhivehi name.
    web = {}
    if WEB_CSV.exists():
        for r in csv.DictReader(open(WEB_CSV)):
            if r["place_id"]:
                web[r["place_id"]] = (int(r["web_id"]), r["name_dv"])
    extra = {}
    for p in json.load(open(OUT / "network.json"))["places"]:
        region = next((k for k, r in REGIONS.items() if r["band"][0] <= p["lat"] < r["band"][1]), None)
        wid, dv = web.get(p["id"], (None, None))
        extra[p["id"]] = {"region": region, "web_id": wid, "name_dv": dv}
    write_json("places-extra.json", extra)
