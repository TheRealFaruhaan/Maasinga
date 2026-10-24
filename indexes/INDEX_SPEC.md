# Island transport indexes: specification (v2)

For the API implementation. Two indexes per inhabited island, **one for passengers and one for goods**,
built only from data that can be collected live. Reference implementation:
`indexes/build_indexes.py` (Python, standard library only), config `indexes/indicators.json`.
Its output `indexes/out/` provides the test values in §9.

---

## 1. The two indexes

| Index | Boats counted | Made of | Scale |
|---|---|---|---|
| **PTI**: Passenger Transport Index | **speedboats** (`fast`), which include the RTL public ferries | `PTI = mean(access, resilience)` | 0–100, higher = better |
| **GTI**: Goods Transport Index | **dhoni + slow boats** | `GTI = mean(supply, resilience)` | 0–100, higher = better |

- **access / supply:** how much service the island gets.
- **resilience:** how well it would cope if a boat or route stopped (redundancy, concentration, alternatives, exposure).

Return both components as well as the index. A low resilience score with good access is the
"one boat away from trouble" case.

Plus, per island, **alerts** (§6), and nationally a **critical-boats list** (§7).

**No double counting:** every trip count comes from FollowMe GPS. RTL ferries are speedboats and are
already in it. The RTL timetable is used **only** as a yes/no "this island has scheduled public ferry
service", never as extra trips.

---

## 2. Live inputs

| Input | Live source | Fields used |
|---|---|---|
| Boat trips | **FollowMe GPS** (API pipeline) | per trip: boat ID, boat type (`fast`/`dhoni`/`slow` from speed), from place, to place, duration |
| Places | API places table | `id`, `lat`, `lon`, `atoll`, `kind` |
| Malé North Harbour arrivals | FollowMe GPS + harbour polygon | per arrival: boat ID, type, origin island |
| Rough-sea effect | FollowMe speeds + Open-Meteo waves (as `sea.json`) | per region: `slope`, `roughWave`, centre `lat` |
| Scheduled public ferry | **MTCC / RTL timetable** (live) | which stops have scheduled trips; stop coordinates |
| Domestic airports | static list (§3.5) | coordinates |
| Population | Census 2022 (static) | residents per island |

Optional live inputs (switched off until data arrives, §8): MTCC ferry ridership, taxis, pickup trucks,
and a vessel class override from MTCC.

**Window:** compute over a rolling window (the reference uses one month, `D = 31` days). Recompute daily
or weekly. Use the same window length every time, so scores are comparable.

---

## 3. Preprocessing

**3.1 Boat class.** `pax` if type = `fast`; `goods` if type ∈ {`dhoni`, `slow`}. An optional
override table `(boat, class)` wins. Use it for vessels whose speed misleads, e.g. a large slow
passenger ferry (Fuvahmulah's main vessel shows as `dhoni`).

**3.2 Regular routes.** For each ordered place pair `(from, to)`, count trips in the window. A route is
**regular** if it has **≥ 20 trips in 31 days** (scale pro rata for other windows). Per regular route,
keep its per-boat trip counts and its median trip time `mins`.

**3.3 Per island `i`** (both directions, regular routes only):
- `t_ib` = trips of boat `b` on regular routes where `i` is `from` or `to`.
- `dep_i[class]` = trips of that class on regular routes with `from = i`.
- `depWeek_i` = **all** departures from `i` in the window (any route) × 7 / D.
- `coverage_i = min(1, Σ_class dep_i / (depWeek_i × D / 7))`.
- `known_i = coverage_i ≥ 0.3`. If not known, the **boat-level** indicators are **null**
  (not zero, not worst). That covers `pax_boats`, `top_pax_share`, `pax_weather_exposure`,
  `cargo_boats` and `top_cargo_share`.

**3.4 Passenger share** `p_i` = `dep_i[pax] / Σ dep_i` when known. Otherwise use the same share
computed over the island's whole atoll, and if that's empty, the national share. Return
`pax_share_source` (`island` | `atoll` | `national`).

**3.5 Locations** (great-circle distance, R = 6371 km):
- A timetable stop belongs to the nearest place within 2 km.
- Airports: Gan (−0.693, 73.156), Hanimaadhoo (6.744, 73.170), Kadhdhoo (1.859, 73.522),
  Kaadedhdhoo (0.488, 72.996), Malé (4.192, 73.529). The others take the coordinates of their island:
  Dharavandhoo, Faresmaathoda, Funadhoo (Sh), Fuvahmulah, Hoarafushi, Ifuru, Kooddoo, Kudahuvadhoo,
  Kulhudhuffushi, Maafaru, Maavarulu, Madivaru, Muli, Thimarafushi.

**3.6 Region** = the `sea` region with the nearest centre latitude. Rough-day loss
`L_r = −slope_r × roughWave_r` (August 2025: north 0.214, central 0.186, midsouth 0.149, south 0.058).

**3.7 Malé hub** = `MLE.Male`, `MLE.Hulhumale`, `MLE.Vilimale`, `MLE.Hulhule`. These are destinations,
not scored.

---

## 4. Indicators (11 in use)

`dir`: **+** a higher value is better, **−** a lower value is better.

### PTI: passenger (speedboats)

| component | id | formula | dir | w |
|---|---|---|:-:|:-:|
| access | `pax_dep_week_per_1000` | `depWeek_i × p_i / pop_i × 1000` | + | 1 |
| access | `pax_destinations` | distinct places linked to `i` by a regular route with ≥ 1 speedboat | + | 1 |
| access | `pax_mins_to_male` | shortest path from `i` to the Malé hub over regular routes with ≥ 1 speedboat (undirected, weight `mins`, Dijkstra). **No path → worst** | − | 1 |
| resilience | `pax_boats` | distinct speedboats with `t_ib > 0` (null if not known) | + | 1 |
| resilience | `top_pax_share` | `max_b t_ib / Σ_b t_ib` over speedboats (null if not known or none) | − | 1 |
| resilience | `pax_alternatives` | `[scheduled public ferry stop on i] + [airport ≤ 15 km]` (0–2) | + | 1 |
| resilience | `pax_weather_exposure` | (speedboat trips on inter-atoll routes / all speedboat trips) × `L_region` (null if not known) | − | 1 |

An **inter-atoll route** has ends in different atolls. Malé hub ↔ Kaafu isn't counted as one.

### GTI: goods (dhoni + slow)

| component | id | formula | dir | w |
|---|---|---|:-:|:-:|
| supply | `cargo_dep_week_per_1000` | `depWeek_i × (1 − p_i) / pop_i × 1000` | + | 1 |
| supply | `harbour_cargo_boats` | distinct goods boats arriving at Malé North Harbour from `i` | + | 1 |
| resilience | `cargo_boats` | distinct goods boats with `t_ib > 0`, together with the harbour goods boats from `i` (null if not known) | + | 1 |
| resilience | `top_cargo_share` | `max_b t_ib / Σ_b t_ib` over goods boats (null if not known or none) | − | 1 |

---

## 5. Scoring

**Per indicator, absolute (use this in the API):** fixed goalposts `[lo, hi]`, with `g(x) = ln(1+x)` where
marked *log*, otherwise `g(x) = x`:

```
u = clamp( (g(x) − g(lo)) / (g(hi) − g(lo)), 0, 1 ) × 100
score = u          (dir +)
score = 100 − u    (dir −)
null x → indicator skipped, except pax_mins_to_male (missing_as_worst) → score 0
```

| id | lo | hi | log |
|---|---:|---:|:-:|
| pax_dep_week_per_1000 | 3 | 80 | ✓ |
| pax_destinations | 0 | 8 | |
| pax_mins_to_male | 40 | 470 | |
| pax_boats | 2 | 50 | ✓ |
| top_pax_share | 0.10 | 0.80 | |
| pax_alternatives | 0 | 2 | |
| pax_weather_exposure | 0 | 0.10 | |
| cargo_dep_week_per_1000 | 0.5 | 25 | ✓ |
| harbour_cargo_boats | 0 | 3 | |
| cargo_boats | 1 | 25 | ✓ |
| top_cargo_share | 0.15 | 0.95 | |

The goalposts are about the 5th–95th percentile of August 2025. **Freeze them** and version any change,
so scores stay comparable over time.

**Aggregate:**
```
component = Σ w·score / Σ w         over that component's indicators with a score
PTI = mean(access, resilience)      GTI = mean(supply, resilience)     (over components that exist)
```
Round to 1 decimal at the end only.

**Optional ranking** (`*_rank`): the same aggregation, but each indicator score is replaced by its
percentile rank among islands. Ties share the average position: `u = position / (N − 1) × 100`, then
oriented by `dir`. For `missing_as_worst`, nulls rank last. Use it for "worst islands this period";
it isn't comparable across periods.

---

## 6. Alerts (per island)

| code | rule |
|---|---|
| `PAX_ONE_BOAT` | `top_pax_share ≥ 0.5` (name the boat) |
| `PAX_NO_PUBLIC` | `pax_alternatives = 0` (no scheduled ferry, no airport within 15 km) |
| `PAX_NO_REGULAR_PATH` | no regular speedboat path to Malé |
| `GOODS_ONE_BOAT` | `top_cargo_share ≥ 0.5` (name the boat) |
| `GOODS_FEW_BOATS` | `cargo_boats ≤ 1` (known islands only) |
| `LOW_COVERAGE` | `coverage < 0.3`: boat-level detail unknown |
| `MAYBE_ROAD_LINKED` | fewer than 10 boats in total and a better-served inhabited island within 3 km |

## 7. Critical boats

A boat is **critical** for an island when it carries ≥ 50% of that island's passenger trips
(`top_pax_share`) or goods trips (`top_cargo_share`). Report the boat, its class, the islands
(with their share) and `residents = Σ pop`. "If this boat stops, these residents lose most of their
passenger/goods service."

---

## 8. Optional indicators (defined, off until data arrives)

Add the data as a table keyed by island code, then set `enabled: true` in `indicators.json`.
Nothing else changes. `per_1000` = divide by population first.

| id | index · component | source | goalposts |
|---|---|---|---|
| `ferry_pax_per_1000` | PTI · access (w 0.5) | MTCC live: RTL passengers per month at the island's stops | 0–500 |
| `taxis_per_1000` | PTI · access (w 0.5) | land transport registry | 0–10 |
| `pickups_per_1000` | GTI · supply (w 0.5) | land transport registry | 0–20 |
| vessel class override | §3.1 | MTCC: tracker ID → passenger/goods | – |

---

## 9. Output and test values

Per island:
```json
{ "code": "K.Maafushi", "pop": 4471, "region": "central", "route_coverage": 0.87, "pax_share": 0.895,
  "indicators": { "pax_dep_week_per_1000": 35.8, "pax_destinations": 10, "pax_mins_to_male": 35,
    "pax_boats": 51, "top_pax_share": 0.209, "top_pax_boat": "…", "pax_alternatives": 0, "pax_weather_exposure": 0.0,
    "cargo_dep_week_per_1000": 4.19, "harbour_cargo_boats": 1, "cargo_boats": 23, "top_cargo_share": 0.293 },
  "PTI": { "value": 81.2, "access": 91.3, "resilience": 71.1, "rank": 77.9 },
  "GTI": { "value": 64.0, "supply": 38.4, "resilience": 89.5, "rank": 76.8 },
  "alerts": ["PAX_NO_PUBLIC"] }
```

Test values, August 2025 (reproduce to ±0.1). Full table in `indexes/out/islands.csv`.

**Scores**

| island | PTI access | PTI resilience | **PTI** | GTI supply | GTI resilience | **GTI** | PTI rank | GTI rank |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gn.Fuvahmulah | 0.0 | 50.0 | 25.0 | 1.8 | 7.9 | 4.8 | 25.4 | 17.2 |
| K.Maafushi | 91.3 | 71.1 | 81.2 | 38.4 | 89.5 | 64.0 | 77.9 | 76.8 |
| L.Maabaidhoo | 24.4 | 42.0 | 33.2 | 15.5 | 60.0 | 37.8 | 40.5 | 42.8 |
| HDh.Kulhudhuffushi | 51.4 | 71.6 | 61.5 | 3.9 | 95.8 | 49.9 | 65.7 | 60.0 |
| HA.Vashafaru | 8.2 | 0.0 | 4.1 | 6.8 | null | 6.8 | 18.5 | 29.5 |
| B.Eydhafushi | 89.8 | 99.7 | 94.7 | 48.8 | 81.2 | 65.0 | 89.2 | 76.8 |

**Indicators**

| island | route_coverage | pax_share | pax_dep_week_per_1000 | pax_destinations | pax_mins_to_male | pax_boats | top_pax_share | pax_alternatives | pax_weather_exposure | cargo_dep_week_per_1000 | harbour_cargo_boats | cargo_boats | top_cargo_share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gn.Fuvahmulah | 1.0 | 0.0 | 0.0 | 0 | null | 0 | null | 1 | 0.0 | 0.66 | 0 | 2 | 0.964 |
| K.Maafushi | 0.87 | 0.895 | 35.8 | 10 | 35 | 51 | 0.209 | 0 | 0.0 | 4.19 | 1 | 23 | 0.293 |
| L.Maabaidhoo | 0.61 | 0.9 | 23.73 | 1 | null | 4 | 0.944 | 1 | 0.0 | 2.64 | 0 | 5 | 0.333 |
| HDh.Kulhudhuffushi | 0.67 | 0.912 | 9.05 | 10 | 368 | 38 | 0.128 | 2 | 0.109 | 0.87 | 0 | 20 | 0.143 |
| HA.Vashafaru | 0.0 | 0.86 | 7.41 | 0 | null | null | null | 0 | null | 1.21 | 0 | null | null |
| B.Eydhafushi | 0.68 | 0.86 | 51.63 | 10 | 110 | 58 | 0.109 | 2 | 0.0 | 8.39 | 1 | 16 | 0.318 |

---

## 10. Reading the results, and limits

- **Tracked boats only:** FollowMe covers part of the fleet, so "1 boat" means 1 *tracked* boat.
- **Class comes from speed.** Large slow ferries look like goods boats. Fuvahmulah's main vessel
  (96% of its trips) is the clearest case, and the vessel class override (§3.1) fixes it.
- **Low coverage:** for 80 of 185 islands, most trips are on routes with < 20 trips a month, so
  boat-level detail is null and the score rests on fewer indicators. Return the count of indicators used.
- **Road-linked islands** (Addu, Laamu link roads) look underserved by boat. See `MAYBE_ROAD_LINKED`.
- **Seasonality:** August is southwest monsoon. Compare like with like (same month a year apart), or
  use a rolling 12-month baseline.

## 11. Headline results, August 2025 (reference run)

- 185 inhabited islands scored (236,911 residents outside Malé).
- **102** islands have no regular speedboat path to Malé (every link 20+ trips/month). Their passenger link is irregular boats or air.
- **53** islands have neither a scheduled public ferry nor an airport within 15 km. 110 have scheduled ferry service.
- **Passenger:** 27 islands rely on one speedboat for half or more of their passenger trips: **26 critical speedboats, 39,376 residents**. Largest: S.Hithadhoo (61%); S.Hulhudhoo (51%) (16,833 residents).
- **Goods:** 40 islands rely on one goods boat for half or more of their goods trips: **36 critical goods boats, 52,644 residents**. Largest: Gn.Fuvahmulah (96%) (9,177 residents).
- Residents on islands scoring below 30: PTI **58,521**, GTI **80,266**.
- Boat-level detail unknown (low coverage) for 80 islands.
- Rough days cut inter-atoll crossings by 18% nationally (from `safety.json`). The rough-sea slowdown is largest in the north.
