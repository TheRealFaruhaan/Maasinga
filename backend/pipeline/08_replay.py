"""Step 8: boat paths for the animated replay of one calm day and one rough day.

Each boat is sampled once every 2 minutes (its last fix in that slot). A path breaks when the boat
stops (under 2 kn) or when there is no fix for 10 minutes. Coordinates are stored as integers
(degrees x 10,000, about 11 m) to keep the files small.

Output: data/out/replay-<date>.json
"""
import json

from common import OUT, PINGS, db, write_json

STEP_MIN = 2
GAP_MIN = 10
CLS = {"fast": 0, "dhoni": 1, "slow": 2}

sea = json.load(open(OUT / "sea.json"))
# Calmest and roughest day in the Male and Ari region (the busiest water).
central = sorted(sea["days"], key=lambda d: d["r"]["central"]["wave"])
days = {"calm": central[0]["d"], "rough": central[-1]["d"]}

con = db()
for label, day in days.items():
    rows = con.execute(f"""
    with s as (
      select imei, cls, time_bucket(interval {STEP_MIN} minute, t) slot,
        arg_max(lat, t) lat, arg_max(lon, t) lon, arg_max(kn, t) kn
      from '{PINGS}' where t::date = '{day}'
      group by 1, 2, 3
    )
    select imei, cls, (epoch(slot) - epoch('{day}'::timestamp)) / 60 m, lat, lon, kn
    from s where kn >= 2 order by imei, slot
    """).fetchall()

    segs, cur, last = [], None, None
    for imei, cls, m, lat, lon, kn in rows:
        if cur is None or imei != cur["imei"] or m - last > GAP_MIN:
            if cur and len(cur["t"]) > 1:
                segs.append(cur)
            cur = {"imei": imei, "c": CLS[cls], "t": [], "p": []}
        cur["t"].append(int(m))
        cur["p"] += [round(lon * 10000), round(lat * 10000)]
        last = m
    if cur and len(cur["t"]) > 1:
        segs.append(cur)

    boats = len({s["imei"] for s in segs})
    write_json(f"replay-{label}.json", {
        "day": day, "label": label, "boats": boats,
        "wave": next(d for d in central if d["d"] == day)["r"]["central"]["wave"],
        "segments": [{"c": s["c"], "t": s["t"], "p": s["p"]} for s in segs],
    })
    print(label, day, "segments", len(segs), "boats", boats)
