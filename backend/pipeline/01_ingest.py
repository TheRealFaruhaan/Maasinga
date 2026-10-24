"""Step 1: clean FollowMe GPS pings into one Parquet file.

Input: data/raw/FollowMe/FollowMe_august_2025/*.csv (17.4M rows, Aug 2025)
Output: data/work/pings.parquet
"""
from common import FAST_KN, DHONI_KN, PINGS, RAW, TZ_OFFSET_H, db

con = db()
src = str(RAW / "FollowMe" / "FollowMe_august_2025" / "*.csv")

# Keep pings inside the Maldives box, drop GPS spikes (speed over 60 kn is not a real boat speed)
# and exact duplicate fixes. Lag = seconds between the device fix and the server receiving it.
con.execute(f"""
create table p as
select distinct on (imei, device_date)
  imei,
  device_date + interval {TZ_OFFSET_H} hour as t,          -- local time
  latitude::double as lat,
  longitude::double as lon,
  speed::double as kn,
  epoch(timestamp) - epoch(device_date) as lag_s
from read_csv('{src}', header=true, types={{'imei':'VARCHAR'}})
where latitude between -1 and 8 and longitude between 72 and 74.5
  and speed between 0 and 60
order by imei, device_date
""")

# Classify each boat once by how fast it usually moves.
con.execute(f"""
create table cls as
select imei,
  case when quantile_cont(kn, 0.9) >= {FAST_KN} then 'fast'
       when quantile_cont(kn, 0.9) >= {DHONI_KN} then 'dhoni'
       else 'slow' end as cls
from p where kn > 3 group by imei
""")

con.execute(f"""
copy (
  select p.*, coalesce(cls.cls, 'slow') as cls
  from p left join cls using (imei)
  order by imei, t
) to '{PINGS}' (format parquet, compression zstd)
""")
print(con.sql(f"select cls, count(distinct imei) boats, count(*) pings from '{PINGS}' group by 1 order by 1"))
