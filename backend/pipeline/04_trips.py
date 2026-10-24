"""Step 4: find stops, places and trips from the GPS pings.

Stop: a boat stays under 1.5 kn for 10 minutes or more (a device that switches off while parked
counts too: the stop ends when the boat next moves).
Place: an inhabited island (Census 2022 list) when the stop is within 2 km of its centre, nearest wins.
Otherwise a "site" (resort, industrial or uninhabited island): a ~550 m grid cell where 4 or more
different boats stopped in August, with touching cells merged.
Trip: a boat leaves one place and its next stop is a different place, 3 min to 12 h later.

Outputs: data/work/stops.parquet, places.parquet, trips.parquet, outage.parquet
"""
from common import PINGS, REF, WORK, db

MOVE_KN = 1.5
MIN_STOP_MIN = 10
ISLAND_KM = 2.0
CELL = 0.005  # degrees, about 550 m
MIN_BOATS_AT_SITE = 4

con = db()
con.execute(f"create table isl as select * from read_csv('{REF / 'islands.csv'}')")

# Runs of stationary pings per boat (gaps-and-islands on the moving flag).
con.execute(f"""
create table f as
select imei, cls, t, lat, lon, kn,
  sum((kn >= {MOVE_KN})::int) over (partition by imei order by t rows unbounded preceding) grp
from '{PINGS}'
""")
# A stop ends at the first moving ping of the next group (grp + 1 starts with a moving ping).
con.execute(f"""
create table stops as
with st as (
  select imei, any_value(cls) cls, grp, min(t) arr, median(lat) lat, median(lon) lon
  from f where kn < {MOVE_KN} group by imei, grp
), dep as (
  select imei, grp, min(t) dep from f where kn >= {MOVE_KN} group by 1, 2
)
select st.imei, st.cls, st.arr, dep.dep, st.lat, st.lon, (epoch(dep.dep) - epoch(st.arr)) / 60.0 as minutes
from st join dep on dep.imei = st.imei and dep.grp = st.grp + 1
where (epoch(dep.dep) - epoch(st.arr)) / 60.0 >= {MIN_STOP_MIN}
""")

# Nearest inhabited island for every stop (equirectangular distance, fine at this scale).
con.execute("""
create table near as
select s.imei, s.arr, arg_min(i.island_code, d.km) code, min(d.km) km
from stops s cross join isl i,
lateral (select 111.2 * sqrt(pow(s.lat - i.lat, 2) + pow((s.lon - i.lon) * cos(radians(s.lat)), 2)) km) d
group by 1, 2
""")

# Sites: busy cells among the stops that are not at an inhabited island; touching cells merge.
cells = con.execute(f"""
select floor(s.lat/{CELL})::int cy, floor(s.lon/{CELL})::int cx, count(*) n, avg(s.lat), avg(s.lon)
from stops s join near using (imei, arr)
where near.km > {ISLAND_KM}
group by 1, 2 having count(distinct s.imei) >= {MIN_BOATS_AT_SITE}
order by 1, 2
""").fetchall()
idx = {(c[0], c[1]): i for i, c in enumerate(cells)}
parent = list(range(len(cells)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for (cy, cx), i in idx.items():
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            j = idx.get((cy + dy, cx + dx))
            if j is not None:
                parent[find(i)] = find(j)

groups = {}
for i, (cy, cx, n, lat, lon) in enumerate(cells):
    g = groups.setdefault(find(i), {"cells": [], "n": 0, "lat": 0.0, "lon": 0.0})
    g["cells"].append((cy, cx))
    g["n"] += n
    g["lat"] += lat * n
    g["lon"] += lon * n

con.execute("create table cellmap(cy int, cx int, site varchar)")
con.execute("create table sites(place varchar, lat double, lon double)")
cm, sites = [], []
# Busiest site first; ties broken by position, so the site IDs are the same on every run.
for k, g in enumerate(sorted(groups.values(), key=lambda g: (-g["n"], min(g["cells"])))):
    name = f"S{k:03d}"
    sites.append((name, g["lat"] / g["n"], g["lon"] / g["n"]))
    cm += [(cy, cx, name) for cy, cx in g["cells"]]
con.executemany("insert into cellmap values (?,?,?)", cm)
con.executemany("insert into sites values (?,?,?)", sites)

con.execute(f"""
create table stops2 as
select s.*, near.code near_island, near.km near_km,
  case when near.km <= {ISLAND_KM} then near.code else c.site end place
from stops s join near using (imei, arr)
left join cellmap c on c.cy = floor(s.lat/{CELL})::int and c.cx = floor(s.lon/{CELL})::int
""")

con.execute("""
create table places as
select place, case when place like 'S%' and place not like '%.%' then 'site' else 'island' end kind,
  count(*) stops, count(distinct imei) boats
from stops2 where place is not null group by 1
""")
con.execute("""
create table places2 as
select p.*, coalesce(i.lat, s.lat) lat, coalesce(i.lon, s.lon) lon
from places p left join isl i on i.island_code = p.place left join sites s on s.place = p.place
""")

# Trips: consecutive stops of one boat at two different places.
con.execute("""
create table trips as
with s as (
  select *, lead(place) over w to_place, lead(arr) over w to_arr
  from stops2 window w as (partition by imei order by arr)
)
select imei, cls, place from_place, to_place, dep, to_arr arr,
  (epoch(to_arr) - epoch(dep)) / 60.0 as minutes
from s
where place is not null and to_place is not null and place <> to_place
  and (epoch(to_arr) - epoch(dep)) / 60.0 between 3 and 720
""")

# Signal: share of each trip's pings that reached the server more than 5 minutes late.
# Hours where over 20% of all pings were late are treated as a server outage and ignored.
con.execute(f"""
create table outage as
select date_trunc('hour', t) h from '{PINGS}' group by 1 having avg((lag_s > 300)::int) > 0.2
""")
con.execute(f"""
create table trip_sig as
select tr.imei, tr.dep, count(*) pings, sum((p.lag_s > 300)::int) late
from trips tr join '{PINGS}' p on p.imei = tr.imei and p.t between tr.dep and tr.arr
where date_trunc('hour', p.t) not in (select h from outage)
group by 1, 2
""")

con.execute(f"copy stops2 to '{WORK / 'stops.parquet'}' (format parquet)")
con.execute(f"copy places2 to '{WORK / 'places.parquet'}' (format parquet)")
con.execute(f"""copy (select t.*, coalesce(s.pings, 0) pings, coalesce(s.late, 0) late
  from trips t left join trip_sig s using (imei, dep)) to '{WORK / 'trips.parquet'}' (format parquet)""")
con.execute(f"copy outage to '{WORK / 'outage.parquet'}' (format parquet)")

print(con.sql("select count(*) stops, count(place) at_place, count(*) filter (where place is null) unplaced from stops2"))
print(con.sql("select kind, count(*) places, sum(stops) stops from places2 group by 1"))
print(con.sql("select cls, count(*) trips, round(median(minutes)) med_min from trips group by 1"))
print(con.sql("select count(*) outage_hours from outage"))
