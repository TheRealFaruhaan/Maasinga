"""Step 12: check the departure prediction model on days it has not seen.

Model (the API runs the same rule on all of August, see api/app/main.py, predict_board):
  For a route, a 15-minute departure slot s and a weekday w:
    k_w = days of weekday w in the training days with a departure in s,  n_w = training days of weekday w
    k   = all training days with a departure in s,                       n   = all training days
    p   = (k_w + A * k / n) / (n_w + A)      the weekday rate, pulled toward the all-days rate (A = 2)
  Bands: very likely p >= 0.7, likely 0.5 to 0.7, possible 0.3 to 0.5. The time is the median departure minute seen in that slot.

Test: train on 1 to 24 August, predict 25 to 31 August (7 days, every weekday once), compare with the real trips.
Baseline: the same slots without the weekday (p = k / n), which is what "usual departures" does.

A prediction is right when a boat left on that route that day within 15 minutes of the predicted time.
Output: predict-eval.json (precision per band, recall, F1), shown by the API with every prediction.
"""
from common import WORK, db, write_json

A = 2.0
THRESHOLD = 0.5
TRAIN = ("2025-08-01", "2025-08-24")
TEST = ("2025-08-25", "2025-08-31")
MIN_ROUTE_TRIPS = 20  # same rule as the listed routes

con = db()
con.execute(f"""
create table t as
select from_place, to_place, dep::date d, isodow(dep) dow,
  strftime(time_bucket(interval 15 minute, dep), '%H:%M') slot, hour(dep) * 60 + minute(dep) m
from '{WORK / 'trips.parquet'}' where dep::date between '{TRAIN[0]}' and '{TEST[1]}'
""")
con.execute(f"""
create table routes as select from_place, to_place from t where d <= '{TRAIN[1]}'
group by 1, 2 having count(*) >= {MIN_ROUTE_TRIPS}
""")
con.execute(f"create table train as select t.* from t join routes using (from_place, to_place) where d <= '{TRAIN[1]}'")
con.execute(f"create table test as select t.* from t join routes using (from_place, to_place) where d >= '{TEST[0]}'")
con.execute(f"create table tdays as select distinct d, isodow(d) dow from range(date '{TRAIN[0]}', date '{TRAIN[1]}' + 1, interval 1 day) r(d)")
con.execute(f"create table xdays as select distinct d::date d, isodow(d) dow from range(date '{TEST[0]}', date '{TEST[1]}' + 1, interval 1 day) r(d)")
n = con.execute("select count(*) from tdays").fetchone()[0]

# Every route-slot seen in training, scored for every test day.
con.execute(f"""
create table scored as
with s as (select from_place, to_place, slot, count(distinct d) k, median(m) m_pred from train group by 1, 2, 3),
sw as (select from_place, to_place, slot, dow, count(distinct d) kw from train group by 1, 2, 3, 4),
nw as (select dow, count(*) nw from tdays group by 1)
select s.from_place, s.to_place, s.slot, x.d, s.m_pred,
  (coalesce(sw.kw, 0) + {A} * s.k / {n}) / (nw.nw + {A}) p,
  s.k / {n} p_base
from s cross join xdays x join nw on nw.dow = x.dow
left join sw on sw.from_place = s.from_place and sw.to_place = s.to_place and sw.slot = s.slot and sw.dow = x.dow
""")
con.execute("create table actual as select distinct from_place, to_place, d, slot, min(m) over (partition by from_place, to_place, d, slot) m from test")
TOL = 15  # a predicted departure is right when a boat left on that route that day within 15 minutes of the predicted time


def hit(pred):
    """Predictions that came true, and real departures that a prediction covered."""
    con.execute(f"create or replace table pred as {pred}")
    n_pred = con.execute("select count(*) from pred").fetchone()[0]
    right = con.execute(f"select count(*) from pred p where exists (select 1 from test a where a.from_place = p.from_place "
                        f"and a.to_place = p.to_place and a.d = p.d and abs(a.m - p.m_pred) <= {TOL})").fetchone()[0]
    covered = con.execute(f"select count(*) from actual a where exists (select 1 from pred p where a.from_place = p.from_place "
                          f"and a.to_place = p.to_place and a.d = p.d and abs(a.m - p.m_pred) <= {TOL})").fetchone()[0]
    return n_pred, right, covered


def score(col, lo, hi=9):
    n_pred, right, covered = hit(f"select * from scored where {col} >= {lo} and {col} < {hi}")
    total = con.execute("select count(*) from actual").fetchone()[0]
    precision, recall = (right / n_pred if n_pred else 0), covered / total
    return {"predicted": n_pred, "came_true": right, "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0}


result = {
    "method": "weekday departure rate per 15-minute slot, pulled toward the all-days rate (A = 2)",
    "train": f"{TRAIN[0]} to {TRAIN[1]}", "test": f"{TEST[0]} to {TEST[1]}",
    "match": f"a prediction is right when a boat left on that route that day within {TOL} minutes of the predicted time",
    "routes": con.execute("select count(*) from routes").fetchone()[0],
    "real_departures": con.execute("select count(*) from actual").fetchone()[0],
    "likely": score("p", THRESHOLD),
    "bands": {"very_likely": score("p", 0.7), "likely": score("p", 0.5, 0.7), "possible": score("p", 0.3, 0.5)},
    "baseline_no_weekday": score("p_base", THRESHOLD),
}
write_json("predict-eval.json", result)
print(result)
