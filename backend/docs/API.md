# Maasinga API

Read-only JSON API over one month of FollowMe boat GPS (August 2025, 17.4M positions, 1,776 trackers),
with weather (ERA5, ERA5-Ocean, NASA IMERG), Census 2022 and OpenStreetMap.
Use this file as the reference for any app that reads the API (including AI coding tools).

- Base URL: `https://maasinga-api.devoup.com`
- Interactive docs (Swagger): `https://maasinga-api.devoup.com/docs`. They list the endpoints and parameters but not the response shapes; this file has the shapes.
- Methods: `GET` only. No login, no key, no cookies.
- CORS: every origin is allowed (`Access-Control-Allow-Origin: *`), so a browser app on any domain or `localhost` can call it.
- Responses are gzipped when the client asks (browsers do).
- Errors: `404` with `{"detail": "..."}` when an id or name does not exist. `502` from `/forecast` when the forecast service does not answer.

## Conventions

| Topic | Rule |
|---|---|
| Period | Boat and weather data is from **1 to 31 August 2025**. It is history, not live. Only `/forecast` is live. |
| Time | Maldives local time (UTC+5). Times are `"HH:MM"`, dates `"YYYY-MM-DD"`, date-times `"YYYY-MM-DDTHH:MM"`. |
| Place id | Inhabited island: `<atoll code>.<census name>`, for example `K.Maafushi`, `R.Alifushi`. Male City: `MLE.Male`, `MLE.Hulhumale`, `MLE.Vilimale`, `MLE.Hulhule` (airport). Other stop sites (resorts, industrial islands, anchorages): `S000` to `S999`, with a `name` such as `Thilafushi` (or `Unnamed site`). |
| Web app island id | Islands also carry `web_id` (the `id` in the team web app's `web/src/data/islands.json`) and `name_dv` (Dhivehi name from the same file). 184 islands have them. Use `web_id` to join the web app's island list to the API. |
| Island names | `name` is the Census 2022 spelling, for example `Dhagethi` not `Dhangethi`, `Vilimale` not `Villimale`. |
| Sea region | `north` (latitude 5.5 to 8), `central` (Male and Ari, 3.5 to 5.5), `midsouth` (1.8 to 3.5), `south` (Huvadhu and Addu, -1 to 1.8). Every place has a `region`. |
| Route | One direction, from one place to another. Listed when it had 20 or more trips in August (654 routes). Dataset endpoints key routes as `"FROM|TO"`. |
| Usual departure | A 15-minute slot (`"06:15"` = 06:15 to 06:29) in which the route had a departure on 30% or more of the 31 days. `days` = on how many days. |
| Boat code | 6 hex characters, for example `284E35` (first 6 characters of an MD5 of the tracker ID). No real tracker ID is published. |
| Boat name, kind, operator | **Demo only**: best guesses from the team's name list, not a vessel register. Names can repeat across boats. `kind` and `operator` are often `null`. |
| Boat type | `fast` = speedboat or launch, `dhoni` = dhoni or ferry, `slow` = slow boat or cargo. Inferred from each boat's usual speed. In replay data: `0` fast, `1` dhoni, `2` slow. |
| Coordinates | Objects use `lat` and `lon` in degrees. Tracks use a flat integer list `[lon, lat, lon, lat, ...]` in **degrees x 10,000** (divide by 10,000). |
| Hours array | 24 numbers: index 0 = 00:00 to 00:59, index 23 = 23:00 to 23:59. |
| Units | Waves in metres, gusts in knots, rain in mm per day, trip times in minutes. |

## Quick start for a trip-planner app

```ts
const API = "https://maasinga-api.devoup.com";
const get = <T,>(path: string): Promise<T> =>
  fetch(API + path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

const islands = await get<Place[]>("/places?kind=island");                    // island picker, nearest island from GPS
const board = await get<Schedule>("/places/K.Maafushi/schedule");             // departure and arrival board of one island
const route = await get<RouteDetail>("/routes/K.Maafushi/MLE.Male");          // usual times, boats per time, track
const sea = await get<Forecast>("/forecast?place=K.Maafushi");                // live sea rating for 3 days
const boat = await get<BoatDetail>("/boats/284E35");                          // one boat: routes, usual times, recent trips
const today = await get<Trip[]>("/trips?from=K.Maafushi&to=MLE.Male&date=2025-08-10"); // real trips on one day
```

How app screens map to the API:

| App need | Call | Notes |
|---|---|---|
| Island list, nearest island from GPS | `/places?kind=island` | 187 islands with `lat`, `lon`, `atoll`, `pop`, `region`, `web_id`, `name_dv`. |
| Island page | `/places/{id}` | Routes leaving and arriving, boats based there, sea region. |
| Departure board ("next boat") | `/places/{id}/schedule` | Every usual departure and arrival with time, destination and the boats that usually run it. Next departure = first `departs` after now. |
| Trip between two islands | `/routes/{from}/{to}` | Usual departures with `arrives` and `boats`, typical crossing time, all boats, map track. `404` if no route. |
| Launch or boat (dhoni) | `type` / `boat_type` / `main_type` | `fast` for launch; `dhoni` or `slow` for boat and cargo. |
| Boats serving an island | `/boats?place={id}` | Boats with trips from or to the island, most trips first. Add `&type=fast`. |
| Boat page | `/boats/{code}` | Routes it runs with its own usual times, trips per day, last 20 trips. |
| Search boats by name | `/boats?q=ferry` | Part of the name or code. |
| Real trip history | `/trips?...` | Filter by `from`, `to`, `boat`, `date`. |
| Is the sea rough now? | `/forecast?place={id}` | Live forecast with a calm, choppy or rough rating per day. |
| Weather in August | `/weather?place={id}`, `/weather/{region}/{date}` | Daily and hourly waves, gusts, rain, and how fast boats ran. |
| Dead zones, rough-sea crossings, harbour | `/signal`, `/safety`, `/harbour` | Whole datasets (see below). |

## App endpoints

#### `GET /places?kind=island|site`
All places where boats stop, sorted by name. `kind` is optional.
```json
[
  {"id": "K.Maafushi", "kind": "island", "name": "Maafushi", "atoll": "Kaafu", "lat": 3.9409, "lon": 73.4897, "pop": 4471, "boats": 99,
   "region": "central", "web_id": 98, "name_dv": "މާފުށި"},
  {"id": "S000", "kind": "site", "name": "Thilafushi", "atoll": null, "lat": 4.1835, "lon": 73.4461, "pop": null, "boats": 659,
   "region": "central", "web_id": null, "name_dv": null}
]
```
- `pop`: residents, Census 2022 (islands only). `boats`: different boats that stopped there in August.

#### `GET /places/{id}`
One place with its routes and boats.
```json
{
  "id": "K.Maafushi", "kind": "island", "name": "Maafushi", "atoll": "Kaafu", "lat": 3.9409, "lon": 73.4897, "pop": 4471, "boats": 99,
  "region": "central", "web_id": 98, "name_dv": "މާފުށި",
  "sea_region": {"region": "central", "name": "Male and Ari", "rough_wave": 1.99},
  "routes_from": [{"from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male",
                   "trips": 155, "boats": 34, "median_min": 51.0, "main_type": "fast", "usual_departures": 6}],
  "routes_to": [{"from_id": "MLE.Male", "from_name": "Male", "to_id": "K.Maafushi", "to_name": "Maafushi", "...": "same fields"}],
  "boats_based": [{"code": "3FE27B", "name": "MAAFUSHI TOURS -3", "type": "fast", "kind": "Speed Boat", "operator": "MAAFUSHI TOURS", "trips": 351}]
}
```
- `sea_region.rough_wave`: wave height (m) that made a day rough in August (top quarter).
- `usual_departures`: how many usual departure times the route has (0 = no regular time).
- `boats_based`: boats whose most frequent stop is this place.

#### `GET /places/{id}/schedule`
Departure and arrival board: every usual departure from the place and every usual arrival at it.
```json
{
  "place": "K.Maafushi",
  "departures": [
    {"departs": "06:15", "arrives": "07:06", "from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male",
     "days": 11, "median_min": 51.0, "main_type": "fast",
     "boats": [{"code": "DA6CD8", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 4}, {"code": "284E35", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 3}]}
  ],
  "arrivals": [{"departs": "05:45", "arrives": "06:07", "from_id": "K.Guraidhoo", "from_name": "Guraidhoo", "to_id": "K.Maafushi", "...": "same fields"}]
}
```
- `departures` sorted by `departs`, `arrivals` sorted by `arrives`.
- `arrives` = `departs` + the route's typical trip time.
- `boats`: up to 3 boats that left in that slot, most days first. `days` = days that boat used that slot.

#### `GET /routes?from={id}&to={id}`
Routes, busiest first. Both filters are optional.
```json
[
  {"from_id": "K.Maafushi", "to_id": "MLE.Male", "from_name": "Maafushi", "to_name": "Male",
   "trips": 155, "boats": 34, "median_min": 51.0, "late_pct": 0.4, "main_type": "fast"}
]
```
- `trips`: trips in August. `boats`: different boats. `median_min`: typical trip minutes. `late_pct`: % of positions on this route sent late (no phone signal). `main_type`: most common boat type.

#### `GET /routes/{from}/{to}`
One route with its usual times, the boats per time, all boats and the track.
```json
{
  "from_id": "K.Maafushi", "to_id": "MLE.Male", "from_name": "Maafushi", "to_name": "Male",
  "trips": 155, "median_min": 51.0, "late_pct": 0.4, "main_type": "fast",
  "departures": [
    {"time": "17:15", "arrives": "18:06", "days": 28,
     "boats": [{"code": "284E35", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 14}, {"code": "DA6CD8", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 13}]}
  ],
  "hours": [2, 1, 0, 0, 1, 2, 12, 18, 1, 2, 4, 15, 4, 21, 2, 1, 4, 30, 5, 8, 21, 1, 0, 0],
  "boats": [{"boat_code": "284E35", "boat_name": "ESCAPE QUEEN 🇲🇻", "boat_type": "fast", "boat_kind": "Speed Boat",
             "trips": 42, "median_min": 48, "last_seen": "2025-08-31"}],
  "path": [734894, 39433, 734882, 39454]
}
```
- `departures`: usual departures (see Conventions), with arrival time and up to 3 boats that ran them.
- `hours`: all departures in August per hour of day.
- `boats`: every boat on the route, most trips first.
- `path`: the real GPS track of one typical trip, one point a minute.

#### `GET /boats?type=&home=&place=&q=&limit=100&offset=0`
Boats, most trips first. All filters optional. `type`: `fast`, `dhoni`, `slow`. `home`: place id the boat is based at. `place`: place id it made trips from or to. `q`: part of the name or code. `limit` up to 2000.
```json
[
  {"code": "3FE27B", "name": "MAAFUSHI TOURS -3", "type": "fast", "kind": "Speed Boat", "operator": "MAAFUSHI TOURS",
   "home": "K.Maafushi", "home_name": "Maafushi", "trips": 351, "routes": 6, "days": 26, "first_day": "2025-08-01", "last_day": "2025-08-31"}
]
```
- `home`: the place it stopped at most. `routes`: different from-to pairs it ran. `days`: days with a trip. 1,613 boats made trips.

#### `GET /boats/{code}`
One boat with its routes, its own usual times, trips per day and its last 20 trips.
```json
{
  "code": "284E35", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "kind": "Speed Boat", "operator": null,
  "home": "MLE.Male", "home_name": "Male", "trips": 286, "days": 30, "first_day": "2025-08-01", "last_day": "2025-08-31",
  "routes": [
    {"from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male", "trips": 42, "median_min": 48.0,
     "last_day": "2025-08-31", "usual": [{"time": "17:15", "days": 14}, {"time": "20:30", "days": 12}]}
  ],
  "daily": [{"d": "2025-08-01", "trips": 7}],
  "recent": [{"boat_code": "284E35", "...": "same fields as /trips"}]
}
```
- `routes[].usual`: 15-minute slots this boat used on 3 or more days on that route.

Note: `routes` is a number in `/boats` and a list in `/boats/{code}`. Boat names can hold emoji (flags).

#### `GET /trips?from=&to=&boat=&date=&limit=100&offset=0&latest=false`
Real trips in August 2025 (68,840 in total), in departure order. All filters optional. `date`: `YYYY-MM-DD`. `limit` up to 5000. `latest=true`: newest first.
```json
[
  {"boat_code": "284E35", "boat_name": "ESCAPE QUEEN 🇲🇻", "boat_type": "fast",
   "from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male",
   "departs": "2025-08-10T06:15", "arrives": "2025-08-10T07:25", "minutes": 70}
]
```
- A trip is two stops in a row at different places (a stop is 10 minutes or more under 1.5 knots). It includes trips on small routes that `/routes` does not list.

#### `GET /weather?region=&place=`
Daily weather in August 2025 per sea region, with how boats ran that day. Give `region` or `place`, or nothing for all regions.
```json
[{"region": "central", "d": "2025-08-05", "wave": 2.42, "gust": 28.8, "rain": 3.9, "idx": 0.872, "rough": true}]
```
- `wave`: highest wave over the region's points. `gust`: strongest gust. `rain`: mean daily rain over the region (NASA IMERG).
- `idx`: speedboat speed against normal (1.00 = normal, 0.87 = 13% slower). `rough`: wave in the top quarter of August for that region.

#### `GET /weather/{region}/{date}`
Hourly waves and gusts for one region and day.
```json
[{"time": "06:00", "wave": 2.24, "gust": 28.8}, {"time": "07:00", "wave": 2.24, "gust": 28.8}]
```

#### `GET /forecast?place=` or `?region=`
**Live** wave forecast for today and the next 2 days (Open-Meteo Marine, highest wave over the region's points), rated with the August boat-speed model. Cached for 30 minutes.
```json
{"region": "central", "name": "Male and Ari", "calm_wave": 1.4, "source": "Open-Meteo Marine forecast",
 "days": [{"d": "2026-10-24", "wave": 1.64, "loss_pct": 2.6, "rating": "calm"}]}
```
- `loss_pct`: expected speedboat slowdown against a calm day (`calm_wave` = the 25th percentile of August waves).
- `rating`: `calm` (under 5%), `choppy` (5 to 10%), `rough` (over 10%).

#### `GET /boat-names`
Display name for every boat code (1,776), `{code: name}`. Demo only.
```json
{"00186F": "MALAS SPEED", "0177B0": "MTCC Rankaru"}
```

#### `GET /health`
```json
{"ok": true, "routes": 654}
```

## Dataset endpoints (whole files, for dashboards)

These return the same JSON as the files in `backend/dashboard/public/data`. Field-by-field notes: [DATA.md](DATA.md).

| Endpoint | Size | Content |
|---|---|---|
| `GET /network` | 197 KB | `places[]`, `routes[]` (short field names: `from`, `to`, `n`, `boats`, `mins`, `latePct`, `cls`, `usual` as `[time, days]`, `hours`), `index[]` (Travel Index per island), `daily[]`, `totals` |
| `GET /route-boats` | 355 KB | `{"FROM|TO": [[code, type, trips, median minutes, last day], ...]}` |
| `GET /paths` | 459 KB | `{"FROM|TO": [lon, lat, ...]}` (x 10,000) |
| `GET /sea` | 170 KB | Boat speed against waves: `sensors`, `regions` (fit per region, with weather `points`), `pooled`, `roughWave`, `days[]` (per region: `idx`, `kn`, `boats`, `wave`, `gust`, `rain`, `rough`), `cells` |
| `GET /safety` | 12 KB | `summary[]`, `days[]`, `roughRoutes[]`, `crossingRates[]`, `fullSpeed`, `seaStops` |
| `GET /signal` | 44 KB | `cells[]` as `[lon, lat, late %, positions, boats]`, `zones[]` (dead zones), `worst[]`, `total` |
| `GET /harbour` | 24 KB | Male North Harbour: `polygon`, `boats[]` (stays, arrivals, days), `entered`, `origins[]`, `hours[]`, `days[]` |
| `GET /replay/calm`, `GET /replay/rough` | 2.2 MB, 1.3 MB | Every moving boat on one day: `day`, `wave`, `boats`, `segments[]` with `c` (type 0/1/2), `t` (minutes after midnight), `p` (flat track x 10,000) |
| `GET /map/land`, `GET /map/reefs` | 0.6 MB, 1.2 MB | GeoJSON base map from OpenStreetMap |

## TypeScript types

```ts
type PlaceId = string;   // "K.Maafushi", "MLE.Male", "S000"
type BoatCode = string;  // "284E35"
type BoatType = "fast" | "dhoni" | "slow";
type Region = "north" | "central" | "midsouth" | "south";

interface Place {
  id: PlaceId; kind: "island" | "site"; name: string; atoll: string | null;
  lat: number; lon: number; pop: number | null; boats: number;
  region: Region; web_id: number | null; name_dv: string | null;
}

interface RouteSummary {
  from_id: PlaceId; to_id: PlaceId; from_name: string; to_name: string;
  trips: number; boats: number; median_min: number; late_pct: number; main_type: BoatType;
}

interface PlaceDetail extends Place {
  sea_region: { region: Region; name: string; rough_wave: number } | null;
  routes_from: (Omit<RouteSummary, "late_pct"> & { usual_departures: number })[];
  routes_to: (Omit<RouteSummary, "late_pct"> & { usual_departures: number })[];
  boats_based: { code: BoatCode; name: string; type: BoatType; kind: string | null; operator: string | null; trips: number }[];
}

interface SlotBoat { code: BoatCode; name: string; type: BoatType; days: number }

interface ScheduleItem {
  departs: string; arrives: string;
  from_id: PlaceId; from_name: string; to_id: PlaceId; to_name: string;
  days: number; median_min: number; main_type: BoatType; boats: SlotBoat[];
}
interface Schedule { place: PlaceId; departures: ScheduleItem[]; arrivals: ScheduleItem[] }

interface RouteDetail {
  from_id: PlaceId; to_id: PlaceId; from_name: string; to_name: string;
  trips: number; median_min: number; late_pct: number; main_type: BoatType;
  departures: { time: string; arrives: string; days: number; boats: SlotBoat[] }[];
  hours: number[]; // 24
  boats: { boat_code: BoatCode; boat_name: string | null; boat_type: BoatType; boat_kind: string | null;
           trips: number; median_min: number; last_seen: string }[];
  path: number[];  // [lon, lat, ...] x 10,000
}

interface Boat {
  code: BoatCode; name: string; type: BoatType; kind: string | null; operator: string | null;
  home: PlaceId | null; home_name: string | null;
  trips: number; routes: number; days: number; first_day: string; last_day: string;
}

interface Trip {
  boat_code: BoatCode; boat_name: string; boat_type: BoatType;
  from_id: PlaceId; from_name: string; to_id: PlaceId; to_name: string;
  departs: string; arrives: string; minutes: number;
}

interface BoatDetail extends Omit<Boat, "routes"> {
  routes: { from_id: PlaceId; from_name: string; to_id: PlaceId; to_name: string; trips: number; median_min: number;
            last_day: string; usual: { time: string; days: number }[] }[];
  daily: { d: string; trips: number }[];
  recent: Trip[];
}

interface WeatherDay { region: Region; d: string; wave: number; gust: number; rain: number; idx: number | null; rough: boolean | null }
interface WeatherHour { time: string; wave: number; gust: number }

interface Forecast {
  region: Region; name: string; calm_wave: number; source: string;
  days: { d: string; wave: number; loss_pct: number; rating: "calm" | "choppy" | "rough" }[];
}

type BoatNames = Record<BoatCode, string>;
```

## What the API does not have

- **Live boat positions or status** (docked, loading, arriving, ETA). Boat data is August 2025 history. Only the sea forecast is live.
- **Dated timetables.** Usual departures come from August patterns, not from an operator timetable.
- **Jetty or berth names.** Stops are grouped per island.
- **Dhivehi boat names, boat colours, phone numbers, fares, bus routes.** Not in any of our data.
- **8 islands of the web app's list** have no match (`web_id` not in the API): HDh Kunburudhoo, HDh Maavaidhoo, Lh Felivaru, Dh Thinhuraa, Dh Vaanee, L Gaadhoo, GA Dhiyadhoo, GDh Maathodaa. They are not in the census island list we use.

## Changes

| Date | Change |
|---|---|
| 2026-10-24 | First version. `/boat-names` added. Harbour uses the smaller team outline. Weather in `/sea` from the team weather export (ERA5, ERA5-Ocean, NASA IMERG), with `points` per region. CORS open to all origins. |
| 2026-10-24 | App endpoints: `/places/{id}`, `/places/{id}/schedule`, `/boats`, `/boats/{code}`, `/trips`, `/weather`, `/weather/{region}/{date}`, `/forecast` (live). `/places` adds `region`, `web_id`, `name_dv`. `/routes` adds a `to` filter. `/routes/{from}/{to}` adds names, `arrives` and `boats` per departure, and boat names and kinds. |
