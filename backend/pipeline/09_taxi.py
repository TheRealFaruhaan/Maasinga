"""Step 9: taxi requests that fail in Greater Male, and the airport arrival wave.

Avas: a request with status ride_expired found no driver. Zones follow the Avas fare matrix,
assigned by latitude (Male, Velana Airport island, Hulhumale Phase 1, Hulhumale Phase 2).
Fares: the Avas car fare matrix (MVR) for the pickup and drop-off zones.
MACL: international arrivals per hour of the day (actual time of arrival), August and September
2025, the same months one year before the Avas data. MACL data ends in July 2026, so the two
sets do not overlap in time; we compare daily patterns, not single days.

Output: data/out/taxi.json
"""
from common import RAW, db, write_json

AVAS = RAW / "Avas_Ride" / "avas_rides_aug_sep_2026.csv"
MACL = RAW / "MACL" / "MACL" / "Airport traffic_Dataset_27092026.csv"
FARES = RAW / "Avas_Ride" / "car_fare_matrix.csv"

con = db()


def zone(lat):
    return f"""case when {lat} < 4.182 then 'Male'
      when {lat} < 4.205 then 'Velana International Airport'
      when {lat} < 4.2285 then 'Hulhumale Phase 1'
      else 'Hulhumale Phase 2' end"""


con.execute(f"""
create table av as
select date_started t, {zone('pickup_lat')} pz, {zone('dropoff_lat')} dz, distance_km, time_sec,
  status = 'ride_expired' expired
from read_csv('{AVAS}')
""")
# Fare matrix: wide to long.
con.execute(f"create table fw as select * from read_csv('{FARES}', header=true)")
cols = [r[0] for r in con.execute("describe fw").fetchall() if r[0] not in ("city", "from_zone \\ to_zone")]
union = " union all ".join(f"select \"from_zone \\ to_zone\" fz, '{c}' tz, \"{c}\" fare from fw" for c in cols)
con.execute(f"create table fares as {union}")

n_days = con.execute("select count(distinct t::date) from av").fetchone()[0]

hourly = con.execute("""
select hour(t) h, count(*) n, sum(expired::int) expired,
  count(*) filter (where pz = 'Velana International Airport') airport_n,
  sum(expired::int) filter (where pz = 'Velana International Airport') airport_expired
from av group by 1 order by 1
""").fetchall()

zones = con.execute("""
select pz, count(*) n, round(100.0 * avg(expired::int), 1) pct, sum(expired::int) expired
from av group by 1 order by n desc
""").fetchall()

lost = con.execute("""
select sum(f.fare) mvr, count(*) n from av join fares f on f.fz = av.pz and f.tz = av.dz where av.expired
""").fetchone()

# Weekday by hour: share of requests that expired (Monday = 1).
grid = con.execute("""
select isodow(t) dow, hour(t) h, count(*) n, round(100.0 * avg(expired::int), 1) pct
from av group by 1, 2 order by 1, 2
""").fetchall()

# MACL arrivals by hour (only valid HH:MM times).
con.execute(f"""
create table ma as select * from read_csv('{MACL}', dateformat='%m/%d/%Y', types={{'ata':'VARCHAR','atd':'VARCHAR'}})
""")
arrivals = con.execute("""
select try_cast(split_part(ata, ':', 1) as int) h,
  round(sum(arr_adults + arr_children + arr_infants) / count(distinct arrival_date), 0) pax_per_day,
  round(count(*) / count(distinct arrival_date)::double, 2) flights_per_day
from ma
where arrival_date between '2025-08-01' and '2025-09-30' and ata like '%:%'
group by 1 having h between 0 and 23 order by 1
""").fetchall()
arr_map = {h: (p, f) for h, p, f in arrivals}

# Hourly airport pickups against arrivals per hour (same hour of day).
r = con.execute(
    "select corr(a, b) from (select unnest(?::double[]) a, unnest(?::double[]) b)",
    [[row[3] for row in hourly], [arr_map.get(row[0], (0, 0))[0] for row in hourly]],
).fetchone()[0]

write_json("taxi.json", {
    "days": n_days,
    "hourly": [
        {"h": h, "n": n, "expired": e, "airportN": an, "airportExpired": ae,
         "arrPax": arr_map.get(h, (0, 0))[0], "arrFlights": arr_map.get(h, (0, 0))[1]}
        for h, n, e, an, ae in hourly
    ],
    "zones": [{"zone": z, "n": n, "pct": p, "expired": e} for z, n, p, e in zones],
    "lostMvr": lost[0], "expired": lost[1],
    "grid": [{"dow": d, "h": h, "n": n, "pct": p} for d, h, n, p in grid],
    "corrAirportArrivals": round(r, 2),
    "total": con.execute("select count(*), sum(expired::int) from av").fetchone(),
})
print(zones)
print("lost MVR", lost, "days", n_days, "corr", r)
