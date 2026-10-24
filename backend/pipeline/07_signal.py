"""Step 7: mobile signal dead zones at sea.

A tracker stores its position when it has no mobile signal and sends it later. So a ping that
reaches the server more than 5 minutes after the fix was taken shows a place with no signal.
We use moving boats only (over 5 kn) and skip the hours of a server outage (step 4).
Cell: 0.05 degrees (about 5.5 km). A cell needs 300 pings from 5 or more boats.

Output: dashboard/public/data/signal.json
"""
from common import REF, WORK, db, write_json

LATE_S = 300
CELL = 0.05

con = db()
con.execute(f"create table isl as select * from read_csv('{REF / 'islands.csv'}')")
con.execute(f"""
create table cells as
select round(floor(lat/{CELL})*{CELL} + {CELL / 2}, 3) la, round(floor(lon/{CELL})*{CELL} + {CELL / 2}, 3) lo,
  count(*) pings, count(distinct imei) boats, avg((lag_s > {LATE_S})::int) late
from '{WORK / 'pings.parquet'}'
where kn > 5 and date_trunc('hour', t) not in (select h from '{WORK / 'outage.parquet'}')
group by 1, 2 having count(*) >= 300 and count(distinct imei) >= 5
""")

cells = con.execute("select lo, la, round(late * 100, 1), pings, boats from cells").fetchall()

# Worst cells, named after the nearest inhabited island and its atoll.
worst = con.execute("""
select c.la, c.lo, round(c.late * 100, 1) pct, c.boats,
  arg_min(i.island, 111.2 * sqrt(pow(c.la - i.lat, 2) + pow((c.lo - i.lon) * cos(radians(c.la)), 2))) near,
  arg_min(i.atoll, 111.2 * sqrt(pow(c.la - i.lat, 2) + pow((c.lo - i.lon) * cos(radians(c.la)), 2))) atoll,
  min(111.2 * sqrt(pow(c.la - i.lat, 2) + pow((c.lo - i.lon) * cos(radians(c.la)), 2))) km
from cells c cross join isl i
where c.late >= 0.25
group by c.la, c.lo, c.late, c.boats order by c.boats * c.late desc limit 12
""").fetchall()

# Dead zones: nearby cells (one-cell gap allowed) where half or more of the pings were late, merged into one zone.
dead = con.execute("select la, lo, late, boats, pings from cells where late >= 0.5").fetchall()
key = {(int(la // CELL), int(lo // CELL)): i for i, (la, lo, *_r) in enumerate(dead)}
parent = list(range(len(dead)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for (y, x), i in key.items():
    for dy in (-2, -1, 0, 1, 2):  # a one-cell gap still joins a zone
        for dx in (-2, -1, 0, 1, 2):
            j = key.get((y + dy, x + dx))
            if j is not None:
                parent[find(i)] = find(j)
zones = {}
for i, (la, lo, late, boats, pings) in enumerate(dead):
    z = zones.setdefault(find(i), {"cells": [], "boats": 0, "pings": 0, "late": 0.0})
    z["cells"].append([lo, la])
    z["boats"] = max(z["boats"], boats)
    z["pings"] += pings
    z["late"] += late * pings
con.execute("create table zc(z int, la double, lo double)")
con.executemany("insert into zc values (?,?,?)", [(k, c[1], c[0]) for k, z in zones.items() for c in z["cells"]])
# The two atolls nearest to each zone name it ("Laamu to Gaafu Alif").
names = dict(con.execute("""
with d as (
  select zc.z, i.atoll, min(111.2 * sqrt(pow(zc.la - i.lat, 2) + pow((zc.lo - i.lon) * cos(radians(zc.la)), 2))) km
  from zc cross join isl i group by 1, 2
)
select z, list(atoll order by km)[1:2] from d group by 1
""").fetchall())
def span_km(cells):
    """Longest extent of a zone, from cell centre to cell centre, plus one cell."""
    lats, lons = [c[1] for c in cells], [c[0] for c in cells]
    dy = (max(lats) - min(lats)) * 111.2
    dx = (max(lons) - min(lons)) * 111.2
    return round((dy * dy + dx * dx) ** 0.5 + CELL * 111.2)


zone_list = sorted(
    [
        {
            "name": " to ".join(names[k]) if names[k][0] != names[k][1] else names[k][0],
            "cells": len(z["cells"]),
            "km": span_km(z["cells"]),
            "boats": z["boats"],
            "latePct": round(100 * z["late"] / z["pings"], 1),
            "lon": round(sum(c[0] for c in z["cells"]) / len(z["cells"]), 3),
            "lat": round(sum(c[1] for c in z["cells"]) / len(z["cells"]), 3),
        }
        for k, z in zones.items()
    ],
    key=lambda z: -(z["cells"] * z["boats"]),
)

total = con.execute("""
select sum(pings), sum(late * pings) / sum(pings), count(*), count(*) filter (where late >= 0.25) from cells
""").fetchone()

write_json("signal.json", {
    "cells": cells,
    "zones": zone_list[:10],
    "worst": [
        {"lat": la, "lon": lo, "pct": p, "boats": b, "near": n, "atoll": a, "km": round(k, 1)}
        for la, lo, p, b, n, a, k in worst
    ],
    "total": {"pings": total[0], "latePct": round(total[1] * 100, 2), "cells": total[2], "deadCells": total[3]},
})
print(total)
for w in zone_list[:8]:
    print(w)
