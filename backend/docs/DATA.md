# Maasinga web data

These 19 files are all the data the Maasinga dashboard and API use. All live in `data/out`. The dashboard uses the first 12 and the harbour timelines; the others were made for apps and are served only by the API. Together they are about 13 MB.
The pipeline (`pipeline/`) built them from the sources below, and `api/seed.py` loads them into PostgreSQL (tables in `api/schema.sql`). The raw GPS (1.8 GB)
is never loaded by the site.

## Sources

| Source | Licence | Period |
|---|---|---|
| FollowMe boat GPS: 17.4M positions from 1,776 trackers | Datathon organiser | Aug 2025 |
| Team weather export (`weather/export`): ERA5 wind gusts and ERA5-Ocean wave height via Open-Meteo, 27 sea points in 4 regions | CC BY 4.0 | Aug 2025 |
| NASA GPM IMERG daily rain (same export), mean over the region | NASA, public | Aug 2025 |
| MBS Census 2022, Table P3 (residents per island) | Maldives Bureau of Statistics | 2022 |
| OpenStreetMap (island outlines and points, reefs, resort names) | ODbL | Current |
| North Harbour outline, drawn by the team | Team | - |

One more source is read live in the browser and not stored: the Open-Meteo marine forecast
(highest wave today and tomorrow over the region's points), for the sea rating on Plan a trip.

Boat IDs in these files are coded (the first 6 characters of an MD5 of the tracker ID).
No real tracker ID is in any file.

Times are Maldives local time (UTC+5). Coordinates stored as integers are degrees x 10,000.

## Files

### network.json (202 KB): places, routes, Travel Index
Pages: Plan a trip, Access, Overview.
- `places[]`: every island or site where boats stop. `id` (for example `K.Maafushi`, or `S012` for a site), `kind` (island or site), `lat`, `lon`, `name`, `atoll`, `pop` (Census 2022, islands only), `boats`.
- `routes[]`: 654 routes with 20 or more trips in August. `from`, `to`, `n` (trips), `boats` (different boats), `mins` (median trip time), `latePct` (share of positions with no signal), `cls` (most common boat type), `usual` (usual departure times as `[time, days]`: a 15-minute slot used on 30% or more of the 31 days), `hours` (departures per hour of day, 24 numbers).
- `index[]`: Travel Index per inhabited island. `island`, `atoll`, `pop`, `depWeek` (boat departures a week), `boats`, `dests`, `index` (departures a week per 1,000 residents).
- `daily[]`: trips per day. `totals`: trips, boats, days, population.

### paths.json (465 KB): the track of each route
Page: Plan a trip (map).
- Key `"FROM|TO"`, value: a flat list `[lon, lat, lon, lat, ...]` (degrees x 10,000), one point a minute.
- It is the real GPS track of one trip: the trip whose time is closest to the route's median.

### route-boats.json (364 KB): boats on each route
Page: Plan a trip (boats list).
- Key `"FROM|TO"`, value: list of `[code, type, trips, median minutes, last day seen]`.
- `type`: `fast` (speedboat), `dhoni` (dhoni or ferry), `slow` (slow boat), from each boat's usual speed.

### sea.json (174 KB): boat speed against waves
Pages: Sea state, Overview.
- Method: each speedboat's normal cruising speed is its August median when over 15 knots. The index is speed divided by that normal (1.00 = normal, 0.87 = 13% slower), averaged over boats.
- `sensors`: speedboats used (790).
- `regions`: per region (`north`, `central`, `midsouth`, `south`): `r_daily` and `r_hourly` (correlation with wave height), `slope` (index change per metre of wave), `intercept`, `r_gust`.
- `roughWave`: wave height that makes a day rough (top quarter of August) per region.
- `days[]`: per day and region: `idx`, `kn` (average knots), `boats`, `wave`, `gust`, `rain`, `rough`.
- `cells`: per day, map cells of 0.1 degrees: `[lon, lat, index, boats]`.

### replay-calm.json (2.3 MB) and replay-rough.json (1.3 MB): every boat on one day
Pages: Sea state (live replay), Overview (map). Calm day 26 Aug, rough day 5 Aug (near Male).
- `day`, `wave`, `boats` (boats moving).
- `segments[]`: `c` (0 speedboat, 1 dhoni, 2 slow), `t` (minutes after midnight), `p` (flat `[lon, lat, ...]`, degrees x 10,000). One point every 2 minutes while moving.

### safety.json (13 KB): trips in rough sea
Pages: Safety, Overview.
- A crossing is a trip between two atolls. A rough day is the top quarter of wave heights in that region.
- `crossingRates[]`: crossings per region-day, rough against calm.
- `days[]`: per day: `crossings`, `roughCrossings`, `nightCrossings`.
- `roughRoutes[]`: busiest crossings in rough sea with `path` (from and to points).
- `fullSpeed`: share of speedboat-days at normal speed or faster, rough against calm, and the boats that did it (`id`, `region`, `roughDays`, `idx`, `maxWave`).
- `seaStops`: stops at sea, rough against calm (tested as a breakdown signal and rejected: they are more common on calm days).

### signal.json (45 KB): where boats lose phone signal
Pages: Signal, Plan a trip, Overview.
- A tracker with no signal stores its position and sends it later. A position that arrives more than 5 minutes late marks a place with no signal. Moving boats only; server outage hours removed.
- `cells[]`: 0.05-degree cells: `[lon, lat, late %, positions, boats]`.
- `zones[]`: dead zones (cells with 50%+ late, merged): `name`, `km` (length), `boats`, `latePct`, `lon`, `lat`.
- `total`: positions, late %, cells, dead cells.

### harbour.json (24 KB): Male North Harbour
Pages: Harbour, Overview.
- Area: the team-drawn outline (`polygon`). A visit ends when the boat is seen outside or after a 2-hour gap. A stay is a visit of 10 minutes or more.
- `boats[]`: per boat: `id`, `type`, `stays`, `tripsIn` (arrivals from another island), `tripsAug`, `medianMin`, `longestMin`, `hours` (total inside), `days`, `dayList` (days of August in the harbour), `origins`.
- `entered`: boats that entered at all. `origins[]`: where arrivals came from. `hours[]`: arrivals per hour. `days[]`: boats per day.

### boat-names.json (41 KB): boat display names (demo)
Pages: Plan a trip, Safety, Harbour.
- `{code: name}` for all 1,776 boats. The name is the team's best guess for the tracker (`guess_name`); 117 trackers with no guess get a name from the same list, picked by code. Names are for the demo, not a vessel register.

### land.json (577 KB) and reefs.json (1.2 MB): the base map
Every map.
- GeoJSON from OpenStreetMap: 1,405 island outlines and 2,926 reef outlines, simplified. The map works without internet.

### trips.json (3.7 MB): every trip (API only)
API: `/trips`, `/boats/{code}`, `/places/{id}/schedule`, `/routes/{from}/{to}`.
- 68,840 trips as `[boat code, from, to, departure "YYYY-MM-DDTHH:MM", minutes]`, in departure order. A trip is two stops in a row at different places, 3 to 720 minutes.

### boats.json (288 KB): one row per boat (API only)
API: `/boats`, `/boats/{code}`.
- 1,613 boats that made a trip: `code`, `name`, `type`, `kind` and `operator` (team name list, demo, often null), `home` (place it stopped at most), `trips`, `routes`, `days`, `first`, `last`.

### weather.json (93 KB): weather per sea region (API only)
API: `/weather`, `/weather/{region}/{date}`.
- Per region: `hourly` as `[time, wave m, gust kn]` and `daily` as `[day, wave m, gust kn, rain mm]`, from `pipeline/reference/weather`.

### places-extra.json (37 KB): extra fields per place (API only)
API: `/places`.
- Per place id: `region` (sea region), `web_id` and `name_dv` (island id and Dhivehi name in the team web app, matched in `pipeline/reference/web_islands.csv`).

### contacts.json (85 KB): demo contacts (API only)
API: `/places/{id}/contacts`.
- Per island: `cargo`, `speedboat`, `ferry`, `shop` lists of `{name, phone}`. **Demo data**: names from the web app's mock lists, numbers are placeholders (`7XXXXXX` / `9XXXXXX`), except the public MTCC hotline 1650.

### predict-eval.json (1 KB): check of the departure prediction (API only)
API: `model.check` in `/predict/*`.
- Trained on 1 to 24 August, tested on 25 to 31 August. Precision, recall and F1 per confidence band, and a baseline without the weekday.

### harbour-timelines.json (1.5 MB): one timeline per North Harbour boat
Page: Harbour (boat timeline). API: `/harbour/boats/{code}/timeline`.
- Per boat code: `km` (distance from Male every 30 minutes, null = no GPS), `stops`, `trips` (out of the Male area and back) and `projection` (next trip from the boat's median cycle). See `pipeline/13_harbour_timeline.py`.

## Limits
- One month of boat data (August 2025, southwest monsoon).
- Only boats with a FollowMe tracker are counted, so counts are lower than the real fleet.
- Boat type comes from speed, not from a vessel register.
- Weather is the worst value over 5 to 8 sea points per region, not the exact place of each boat.
