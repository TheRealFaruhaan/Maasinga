# Maasinga API

Read-only JSON API over one month of FollowMe boat GPS (August 2025, 17.4M positions, 1,776 trackers),
with weather (ERA5, ERA5-Ocean, NASA IMERG), Census 2022 and OpenStreetMap.
Use this file as the reference for any app that reads the API (including AI coding tools).

- Base URL: `https://maasinga-api.devoup.com`
- Interactive docs (Swagger): `https://maasinga-api.devoup.com/docs`. They list the endpoints and parameters but not the response shapes; this file has the shapes.
- Methods: `GET` for data, `POST` and `DELETE` only for logins and users.
- **Login:** public routes need nothing. Routes marked 🔒 need `Authorization: Bearer <token>` from `POST /auth/login`. See [Login and permissions](#login-and-permissions).
- CORS: every origin is allowed (`Access-Control-Allow-Origin: *`), so a browser app on any domain or `localhost` can call it.
- Responses are gzipped when the client asks (browsers do).
- Errors: `{"detail": "..."}` with `401` (no login, wrong password, expired or bad token), `403` (role too low), `404` (unknown id or name), `502` (`/forecast`: the forecast service did not answer).

## Login and permissions

| Who | Routes |
|---|---|
| **Public** (no login) | `/health`, `/apps`, `/airport-taxi-fares`, `/hotlines`, `/bus-routes`, `/bus-ridership`, `/static/apps/*`, `/places`, `/places/{id}`, `/places/{id}/schedule`, `/places/{id}/contacts`, `/predict/routes/{from}/{to}`, `/predict/places/{id}`, `/routes`, `/routes/{from}/{to}`, `/weather`, `/weather/{region}/{date}`, `/forecast`, `/map/land`, `/map/reefs`, `POST /auth/login` |
| 🔒 **policy** (and admin) | `/boats`, `/boats/{code}`, `/trips`, `/boat-names`, `/harbour/boats/{code}/timeline`, all dataset routes (`/network`, `/paths`, `/route-boats`, `/sea`, `/safety`, `/signal`, `/harbour`, `/replay/*`), `/auth/me` |
| 🔒 **admin** | `/auth/users` (list, add, delete users) |

Flow:
1. `POST /auth/login` with JSON `{"username": "...", "password": "..."}`.
2. Keep `access_token` (a JWT, valid 12 hours, see `expires_at` in Unix seconds).
3. Send it on protected calls: `Authorization: Bearer <access_token>`.
4. On `401`, log in again. There is no refresh token. Deleting a user or changing their role works at once, even for tokens already given out.

#### `POST /auth/login`
```json
// request
{"username": "farhan", "password": "secret-password"}
// 200
{"access_token": "eyJhbGciOi...", "token_type": "bearer", "expires_at": 1792839600, "user": {"username": "farhan", "role": "policy"}}
// 401
{"detail": "Wrong username or password"}
```

#### `GET /auth/me` 🔒
```json
{"username": "farhan", "role": "policy"}
```

#### `GET /auth/users` 🔒 admin
```json
[{"username": "admin", "role": "admin", "created": "2026-10-24T15:10"}]
```

#### `POST /auth/users` 🔒 admin
Add a user, or set a new password and role for an existing one. `role`: `policy` (default) or `admin`. Password: 8 or more characters. Username: 3 to 64 of `A-Z a-z 0-9 _ . @ -`.
```json
// request
{"username": "farhan", "password": "secret-password", "role": "policy"}
// 201
{"username": "farhan", "role": "policy"}
```

#### `DELETE /auth/users/{username}` 🔒 admin
```json
{"deleted": "farhan"}
```
An admin cannot delete themself.

```ts
// Login in a browser app
const r = await fetch(API + "/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!r.ok) throw new Error(r.status === 401 ? "Wrong username or password" : String(r.status));
const { access_token } = await r.json();
const boats = await fetch(API + "/boats?place=K.Maafushi", { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json());
```

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
const getAuth = <T,>(path: string): Promise<T> =>
  fetch(API + path, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

const islands = await get<Place[]>("/places?kind=island");                    // island picker, nearest island from GPS
const board = await get<Schedule>("/places/K.Maafushi/schedule");             // departure and arrival board of one island
const route = await get<RouteDetail>("/routes/K.Maafushi/MLE.Male");          // usual times, boats per time, track
const sea = await get<Forecast>("/forecast?place=K.Maafushi");                // live sea rating for 3 days
// Protected (policy login): send the token, see "Login and permissions"
const boat = await getAuth<BoatDetail>("/boats/284E35");                      // one boat: routes, usual times, recent trips
const today = await getAuth<Trip[]>("/trips?from=K.Maafushi&to=MLE.Male&date=2025-08-10"); // real trips on one day
```

How app screens map to the API:

| App need | Call | Notes |
|---|---|---|
| Island list, nearest island from GPS | `/places?kind=island` | 187 islands with `lat`, `lon`, `atoll`, `pop`, `region`, `web_id`, `name_dv`. |
| Island page | `/places/{id}` | Routes leaving and arriving, boats based there, sea region. |
| Departure board ("next boat") | `/places/{id}/schedule` | Every usual departure and arrival with time, destination and the boats that usually run it. Next departure = first `departs` after now. |
| Trip between two islands | `/routes/{from}/{to}` | Usual departures with `arrives` and `boats`, typical crossing time, all boats, map track, one-stop connections (`via`). Pairs with few trips return `listed: false`. |
| Launch or boat (dhoni) | `type` / `boat_type` / `main_type` | `fast` for launch; `dhoni` or `slow` for boat and cargo. |
| Boats serving an island | `/places/{id}/schedule` (public), `/boats?place={id}` (🔒) | The schedule lists the boats per departure. The boats list (login) has every boat with trips from or to the island. |
| Boat page (🔒) | `/boats/{code}` | Routes it runs with its own usual times, trips per day, last 20 trips. |
| Search boats by name (🔒) | `/boats?q=ferry` | Part of the name or code. |
| Real trip history (🔒) | `/trips?...` | Filter by `from`, `to`, `boat`, `date`. |
| Is the sea rough now? | `/forecast?place={id}` | Live forecast with a calm, choppy or rough rating per day. |
| Weather in August | `/weather?place={id}`, `/weather/{region}/{date}` | Daily and hourly waves, gusts, rain, and how fast boats ran. |
| Departures on a chosen day (future dates) | `/predict/routes/{from}/{to}?date=`, `/predict/places/{id}?date=` | Predicted times with a probability, from the August pattern for that weekday plus the live sea forecast. |
| Quick contacts (cargo, speedboat, ferry, shop) | `/places/{id}/contacts` | **Demo** names and placeholder numbers. |
| One harbour boat over time (distance from Male, calls, next trip) (🔒) | `/harbour/boats/{code}/timeline` | Boat codes from `/harbour` (`boats[].id`). |
| Taxi apps, ferry ticket app (store links, hotline, icon) | `/apps?place={id}` or `/apps?category=taxi` | Same fields as the web app's `AppLink`. Icons hosted by the API. |
| Airport taxi fares | `/airport-taxi-fares` | Fixed fares from Velana Airport, car and 7 to 10 seats. |
| Greater Male bus routes | `/bus-routes` | From, to, fare, frequency, hours, colour (English and Dhivehi). |
| Bus passengers per route | `/bus-ridership?period=month` or `day` | **Sample data** (random figures in the organiser's file). |
| Emergency numbers, hotlines | `/hotlines?category=emergency` or `transport` | Police, ambulance, fire; taxi line, MTCC. |
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
One route with its usual times, the boats per time, all boats, the track and connections with one stop.
Every pair of known places answers `200`; `404` only when a place id does not exist.
- `listed: true`: a route with 20 or more trips in August (full data).
- `listed: false`: fewer trips (or none). It still has `trips`, `boats_count`, `median_min`, `main_type`, `hours` and `boats` from the real trips, but `departures` and `path` are empty and `late_pct` is `null`. Show `via` as the alternative.
```json
{
  "from_id": "K.Maafushi", "to_id": "MLE.Male", "from_name": "Maafushi", "to_name": "Male", "listed": true,
  "trips": 155, "boats_count": 34, "median_min": 51.0, "late_pct": 0.4, "main_type": "fast",
  "departures": [
    {"time": "17:15", "arrives": "18:06", "days": 28,
     "boats": [{"code": "284E35", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 14}, {"code": "DA6CD8", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 13}]}
  ],
  "hours": [2, 1, 0, 0, 1, 2, 12, 18, 1, 2, 4, 15, 4, 21, 2, 1, 4, 30, 5, 8, 21, 1, 0, 0],
  "boats": [{"boat_code": "284E35", "boat_name": "ESCAPE QUEEN 🇲🇻", "boat_type": "fast", "boat_kind": "Speed Boat",
             "trips": 42, "median_min": 48, "last_seen": "2025-08-31"}],
  "path": [734894, 39433, 734882, 39454],
  "via": [{"via_id": "MLE.Hulhule", "via_name": "Hulhule", "first_trips": 186, "second_trips": 558,
           "first_min": 39.0, "second_min": 8.0, "first_type": "fast", "second_type": "fast"}]
}
```
- `departures`: usual departures (see Conventions), with arrival time and up to 3 boats that ran them.
- `hours`: all departures in August per hour of day.
- `boats`: every boat on the route, most trips first.
- `path`: the real GPS track of one typical trip, one point a minute.
- `via`: up to 5 connections with one stop (listed route `from` -> `via_id`, then listed route `via_id` -> `to`), busiest first. `first_*` and `second_*` describe the two legs. Empty when there is none.

#### `GET /boats?type=&home=&place=&q=&limit=100&offset=0` 🔒
Boats, most trips first. All filters optional. `type`: `fast`, `dhoni`, `slow`. `home`: place id the boat is based at. `place`: place id it made trips from or to. `q`: part of the name or code. `limit` up to 2000.
```json
[
  {"code": "3FE27B", "name": "MAAFUSHI TOURS -3", "type": "fast", "kind": "Speed Boat", "operator": "MAAFUSHI TOURS",
   "home": "K.Maafushi", "home_name": "Maafushi", "trips": 351, "routes": 6, "days": 26, "first_day": "2025-08-01", "last_day": "2025-08-31"}
]
```
- `home`: the place it stopped at most. `routes`: different from-to pairs it ran. `days`: days with a trip. 1,613 boats made trips.

#### `GET /boats/{code}` 🔒
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

#### `GET /trips?from=&to=&boat=&date=&limit=100&offset=0&latest=false` 🔒
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

#### `GET /predict/routes/{from}/{to}?date=&days=1&min_p=0.3`
Predicted departures between two places for any day (default today, Maldives time). `days`: 1 to 14. `min_p`: lowest probability returned.
```json
{
  "from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male",
  "days": [{
    "date": "2026-10-24", "weekday": "Sat",
    "sea": {"d": "2026-10-24", "wave": 1.64, "loss_pct": 2.6, "rating": "calm"},
    "departures": [
      {"departs": "13:45", "arrives": "14:33", "from_id": "K.Maafushi", "from_name": "Maafushi", "to_id": "MLE.Male", "to_name": "Male",
       "probability": 0.74, "confidence": "very likely", "slot": "13:45", "minutes": 48,
       "runs_on": ["Mon", "Tue", "Wed", "Thu", "Sat"],
       "boats": [{"code": "284E35", "name": "ESCAPE QUEEN 🇲🇻", "type": "fast", "days": 7}]}
    ]
  }],
  "model": {"method": "...", "trained_on": "2025-08-01 to 2025-08-31",
            "check": {"train": "2025-08-01 to 2025-08-24", "test": "2025-08-25 to 2025-08-31",
                      "precision": {"very_likely": 0.836, "likely": 0.644, "possible": 0.419}}}
}
```
- **Model:** for each listed route and 15-minute departure slot, `probability` = how often boats left in that slot on that weekday in August 2025, pulled toward the all-days rate: `(k_weekday + 2 * k_all / 31) / (n_weekday + 2)`.
- `departs`: the median real departure minute in that slot. `arrives` and `minutes`: the median trip time, plus the forecast slowdown.
- `confidence`: `very likely` (0.7 or more), `likely` (0.5 to 0.7), `possible` (0.3 to 0.5).
- `runs_on`: weekdays with a probability of 0.5 or more for that slot.
- `sea`: the live forecast for that day when it is within the next 3 days (else `null`). On a `rough` day the probability is lowered by the drop in crossings seen on rough days in August (about 22%).
- **How good it is:** trained on 1 to 24 August and checked on 25 to 31 August (each weekday once). A prediction counts as right when a boat left on that route that day within 15 minutes of the predicted time. Right: 84% of `very likely`, 64% of `likely`, 42% of `possible`. Full numbers: `model.check`.
- It predicts regular departures only; one-off trips are not predicted. It cannot know about holidays, breakdowns or new timetables.

#### `GET /predict/places/{id}?date=&days=1&min_p=0.3`
The predicted departure and arrival board of one place. `days`: 1 to 7. Each day has `date`, `weekday`, `sea`, `departures[]` and `arrivals[]` (same item fields as above), plus `model`.

#### `GET /places/{id}/contacts?category=`
**Demo** quick contacts for an island, by category: `cargo`, `speedboat`, `ferry`, `shop`. Names follow the web app's mock lists. Numbers are placeholders (`7XXXXXX`, `9XXXXXX`), never real numbers, except the public MTCC hotline `1650`. The same island always gets the same contacts.
```json
{"place": "K.Maafushi", "demo": true, "contacts": {
  "cargo": [{"name": "Zillion Maafushi", "phone": "9XXXXXX"}],
  "speedboat": [{"name": "Reef Runner Maafushi", "phone": "9XXXXXX"}],
  "ferry": [{"name": "Island Ferry Maafushi", "phone": "9XXXXXX"}, {"name": "MTCC Ferry", "phone": "1650"}],
  "shop": [{"name": "Harbour Mart Maafushi", "phone": "9XXXXXX"}]}}
```
Male City areas (`MLE.Male`, `MLE.Hulhumale`, `MLE.Vilimale`, `MLE.Hulhule`) get demo contacts the same way as every other island.

#### `GET /harbour/boats/{code}/timeline` 🔒
One North Harbour boat over August 2025, for an "every trip as distance from Male" chart. Codes: the 119 boats in `/harbour` (`boats[].id`). `404` for other codes.
```json
{
  "code": "CD6A3A", "name": "Aliraastha", "type": "dhoni", "kind": "Supply Dhoni", "operator": null,
  "t0": "2025-08-01T00:00", "step_min": 30,
  "km": [null, null, "...", 27.0, 20.1, 10.0, 2.0, "... 1,488 values"],
  "stops": [{"arr": "2025-08-02T07:18", "dep": "2025-08-02T07:30", "place": "K.Thulusdhoo", "name": "Thulusdhoo",
             "male": false, "harbour": false, "km": 27.0, "minutes": 12}],
  "trips": [{"left": "2025-08-02T15:29", "back": "2025-08-03T09:04", "hours": 17.6, "calls": ["K.Thulusdhoo"],
             "furthest": "K.Thulusdhoo", "furthest_km": 27.0}],
  "projection": {"from": "in Male", "leaves": "2025-08-31T15:28", "back": "2025-09-01T13:04",
                 "median_stay_in_male_h": 6.6, "median_trip_h": 21.6, "based_on_trips": 22,
                 "today": {"leaves": "2026-10-25T02:52", "back": "2026-10-26T00:28", "note": "the August cycle repeated to today; a pattern, not a schedule"}},
  "places": {"K.Thulusdhoo": {"id": "K.Thulusdhoo", "name": "Thulusdhoo", "lat": 4.373, "lon": 73.6481}}
}
```
- `km`: distance from Male (km) every `step_min` minutes from `t0` (local time): value `i` is at `t0 + i * 30 min`. A boat that sends nothing keeps its last value for up to 6 hours (lying still); after that `null` = no GPS (draw it hatched).
- `stops`: every stop (10 minutes or more under 1.5 knots). `male: true` = in the Male area (within 15 km of Male: Male City, Thilafushi, Gulhifalhu), draw it as "time in Male". `harbour: true` = inside the North Harbour outline. `place` can be `null` (a stop at sea or an unnamed spot).
- `trips`: each time the boat left the Male area and came back, with the islands it called at and the furthest point.
- `projection` (only with 2 or more trips): the next departure and return after the last day of data, from the boat's median time in Male between trips and its median trip length. `today` repeats that cycle up to today: a pattern, not a schedule. `from: "away"` means the boat was out at the end of August (`leaves` is `null`).
- Not in our data: MPL harbour or port lists.

#### `GET /apps?category=&place=`
Transport apps with store links, hotline and icon. Same field names as the web app's `AppLink` type (`web/src/lib/apps.ts`), plus `category`, `googlePlayUrl` and `places`.
- `category`: `taxi` (Malé Taxi, Avas, Nala Taxi, Quick Mv) or `ferry` (RTL Travel: MTCC ferry and bus tickets).
- `place`: only apps that serve that place. Taxi apps serve Male City (`MLE.Male`, `MLE.Hulhumale`, `MLE.Vilimale`, `MLE.Hulhule`); RTL Travel serves every island (`places: null`).
```json
[
  {"id": "male-taxi", "category": "taxi", "name": "Malé Taxi", "name_dv": "މާލެ ޓެކްސީ",
   "blurb": {"en": "Government taxi line · book or schedule", "dv": "ސަރުކާރުގެ ޓެކްސީ ލައިން"},
   "color": "#C2413B", "initials": "MT", "icon": "https://maasinga-api.devoup.com/static/apps/male-taxi.jpg",
   "iosUrl": "https://apps.apple.com/app/id6761259497", "androidPackage": "mv.mtcc.TaxiApp",
   "googlePlayUrl": "https://play.google.com/store/apps/details?id=mv.mtcc.TaxiApp",
   "webUrl": null, "hotline": "1655", "places": ["MLE.Male", "MLE.Hulhumale", "MLE.Vilimale", "MLE.Hulhule"]}
]
```
- `icon`: full URL of a 256x256 JPEG hosted by the API (`/static/apps/{id}.jpg`).
- The list is curated by the team (`backend/api/apps.json`), not from the boat data.

#### `GET /airport-taxi-fares`
Fixed taxi fares from Velana Airport (airport website, October 2026), in MVR.
```json
[
  {"to": {"en": "Malé", "dv": "މާލެ"}, "place_id": "MLE.Male", "car_mvr": 70, "van_mvr": 110, "car": "MVR 70", "van": "MVR 110"},
  {"to": {"en": "Hulhumalé Phase 1", "dv": "ހުޅުމާލެ ފޭސް 1"}, "place_id": "MLE.Hulhumale", "car_mvr": 80, "van_mvr": 125, "car": "MVR 80", "van": "MVR 125"},
  {"to": {"en": "Hulhumalé Phase 2", "dv": "ހުޅުމާލެ ފޭސް 2"}, "place_id": "MLE.Hulhumale", "car_mvr": 85, "van_mvr": 130, "car": "MVR 85", "van": "MVR 130"}
]
```
- `car`: standard car (under 6 seats). `van`: 7 to 10 seats. The `_mvr` fields are numbers; `car` and `van` are ready-made labels.

#### `GET /hotlines?category=`
Emergency numbers and transport hotlines. `category`: `emergency` or `transport` (optional).
```json
[
  {"id": "police", "category": "emergency", "number": "119", "name": {"en": "Police", "dv": "ފުލުހުން"}},
  {"id": "ambulance", "category": "emergency", "number": "102", "name": {"en": "Ambulance", "dv": "އެމްބިއުލާންސް"}},
  {"id": "fire", "category": "emergency", "number": "118", "name": {"en": "Fire & Rescue", "dv": "ފަޔަރ އެންޑް ރެސްކިއު"}},
  {"id": "taxi", "category": "transport", "number": "1655", "name": {"en": "Taxi line", "dv": "ޓެކްސީ ލައިން"}},
  {"id": "mtcc", "category": "transport", "number": "1650", "name": {"en": "MTCC ferry & bus", "dv": "އެމްޓީސީސީ ފެރީ އަދި ބަސް"}}
]
```
These are real public numbers.

#### `GET /bus-routes`
Greater Male bus routes (MTCC / RTL), from the team web app's list (public sources, October 2026) plus R7 from the organiser's MTCC file.
```json
[
  {"code": "R3", "from": {"en": "Malé · West Park", "dv": "މާލެ · ވެސްޓް ޕާކް"}, "to": {"en": "Velana Airport", "dv": "ވެލާނާ އެއާޕޯޓު"},
   "fare_mvr": 10, "fare": "MVR 10", "every_min": 60, "hours": "06:40-00:40", "color": "#C2413B", "ridership": true}
]
```
- 10 routes: R1, R2, R3, R4, R5, R7, R9, R10, R11, R12. `fare_mvr`, `every_min` and `hours` are `null` where not known.
- `ridership: true`: the route has figures in `/bus-ridership` (R1, R2, R3, R4, R7).
- Routes change (road works, Ramadan); the RTL app has the live timetable.

#### `GET /bus-ridership?period=month&route=&start=&end=`
Bus passengers per route: `paid`, `foc` (free of charge: over 65, people with disabilities, infants) and `total`.
**Sample data:** the organiser's MTCC file says every passenger figure is randomly generated and is not MTCC data. Show it as an example only.
- `period`: `month` (`at` = `YYYY-MM`, Jan 2023 to Dec 2025, routes R1, R2, R3, R4, R7) or `day` (`at` = `YYYY-MM-DD`, 2025, routes R1, R2, R4).
- `start`, `end`: in the same format as `at`. `400` for another `period`.
```json
{"sample": true, "note": "Route names and codes are real; all passenger figures are randomly generated and are not actual MTCC data (MTCC file notes).",
 "period": "month",
 "rows": [{"at": "2025-01", "route": "R1", "paid": 106877, "foc": 52451, "total": 159328}]}
```

#### `GET /boat-names` 🔒
Display name for every boat code (1,776), `{code: name}`. Demo only.
```json
{"00186F": "MALAS SPEED", "0177B0": "MTCC Rankaru"}
```

#### `GET /health`
```json
{"ok": true, "routes": 654}
```

## Dataset endpoints (whole files, for dashboards)

All need a **policy** login (🔒) except `/map/*`. They return the same JSON as the files in `backend/data/out`. Field-by-field notes: [DATA.md](DATA.md).

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
  listed: boolean; // false: fewer than 20 trips; departures and path are empty
  trips: number; boats_count: number; median_min: number | null; late_pct: number | null; main_type: BoatType | null;
  departures: { time: string; arrives: string; days: number; boats: SlotBoat[] }[];
  hours: number[]; // 24
  boats: { boat_code: BoatCode; boat_name: string | null; boat_type: BoatType; boat_kind: string | null;
           trips: number; median_min: number; last_seen: string }[];
  path: number[];  // [lon, lat, ...] x 10,000
  via: { via_id: PlaceId; via_name: string; first_trips: number; second_trips: number; first_min: number; second_min: number;
         first_type: BoatType; second_type: BoatType }[];
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

interface TransportApp {
  id: string; category: "taxi" | "ferry"; name: string; name_dv: string | null;
  blurb: { en: string; dv: string }; color: string; initials: string; icon: string | null;
  iosUrl: string | null; androidPackage: string | null; googlePlayUrl: string | null;
  webUrl: string | null; hotline: string | null; places: PlaceId[] | null; // null = every island
}

interface PredictedDeparture {
  departs: string; arrives: string; from_id: PlaceId; from_name: string; to_id: PlaceId; to_name: string;
  probability: number; confidence: "very likely" | "likely" | "possible"; slot: string; minutes: number;
  runs_on: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];
  boats: { code: BoatCode; name: string; type: BoatType; days: number }[];
}
interface PredictedDay {
  date: string; weekday: string;
  sea: { d: string; wave: number; loss_pct: number; rating: "calm" | "choppy" | "rough" } | null;
  departures: PredictedDeparture[];
  arrivals?: PredictedDeparture[]; // place board only
}
interface Prediction { days: PredictedDay[]; model: { method: string; trained_on: string; check: Record<string, unknown> } }

type ContactCategory = "cargo" | "speedboat" | "ferry" | "shop";
interface Contacts { place: PlaceId; demo: true; contacts: Record<ContactCategory, { name: string; phone: string }[]> }

interface HarbourTimeline {
  code: BoatCode; name: string | null; type: BoatType | null; kind: string | null; operator: string | null;
  t0: string; step_min: number; km: (number | null)[];
  stops: { arr: string; dep: string; place: PlaceId | null; name: string | null; male: boolean; harbour: boolean; km: number; minutes: number }[];
  trips: { left: string; back: string; hours: number; calls: PlaceId[]; furthest: PlaceId | null; furthest_km: number | null }[];
  projection: null | { from: "in Male" | "away"; leaves: string | null; back: string; median_stay_in_male_h: number; median_trip_h: number;
                       based_on_trips: number; today?: { leaves: string; back: string; note: string } };
  places: Record<PlaceId, { id: PlaceId; name: string; lat: number; lon: number }>;
}

interface AirportTaxiFare { to: { en: string; dv: string }; place_id: PlaceId; car_mvr: number; van_mvr: number; car: string; van: string }
interface Hotline { id: string; category: "emergency" | "transport"; number: string; name: { en: string; dv: string } }

interface BusRoute {
  code: string; from: { en: string; dv: string }; to: { en: string; dv: string };
  fare_mvr: number | null; fare: string | null; every_min: number | null; hours: string | null; color: string; ridership: boolean;
}
interface BusRidership { sample: true; note: string; period: "month" | "day"; rows: { at: string; route: string; paid: number; foc: number; total: number }[] }

interface LoginResult {
  access_token: string; token_type: "bearer"; expires_at: number; // Unix seconds
  user: { username: string; role: "policy" | "admin" };
}
```

## What the API does not have

- **Live boat positions or status** (docked, loading, arriving, ETA). Boat data is August 2025 history. Only the sea forecast is live.
- **Dated timetables.** Usual and predicted departures come from August patterns, not from an operator timetable.
- **Real contact numbers.** `/places/{id}/contacts` is demo data.
- **Jetty or berth names.** Stops are grouped per island.
- **Dhivehi boat names, boat colours, fares, bus routes, other phone numbers.** Not in any of our data (only the hotlines in `/apps`).
- **8 islands of the web app's list** have no match (`web_id` not in the API): HDh Kunburudhoo, HDh Maavaidhoo, Lh Felivaru, Dh Thinhuraa, Dh Vaanee, L Gaadhoo, GA Dhiyadhoo, GDh Maathodaa. They are not in the census island list we use.

## Changes

| Date | Change |
|---|---|
| 2026-10-24 | First version. `/boat-names` added. Harbour uses the smaller team outline. Weather in `/sea` from the team weather export (ERA5, ERA5-Ocean, NASA IMERG), with `points` per region. CORS open to all origins. |
| 2026-10-24 | App endpoints: `/places/{id}`, `/places/{id}/schedule`, `/boats`, `/boats/{code}`, `/trips`, `/weather`, `/weather/{region}/{date}`, `/forecast` (live). `/places` adds `region`, `web_id`, `name_dv`. `/routes` adds a `to` filter. `/routes/{from}/{to}` adds names, `arrives` and `boats` per departure, and boat names and kinds. |
| 2026-10-24 | Logins: `POST /auth/login` (JWT, 12 h), `/auth/me`, admin user routes `/auth/users`. Policy login now needed for `/boats`, `/boats/{code}`, `/trips`, `/boat-names` and all dataset routes except `/map/*`. Trip-planner routes stay public. |
| 2026-10-24 | `/routes/{from}/{to}` answers `200` for every pair of known places (`listed: false` with the real trips when the pair has fewer than 20 trips; `404` only for an unknown place). Adds `listed`, `boats_count` and `via` (one-stop connections). |
| 2026-10-24 | `/apps`: taxi apps and RTL Travel with store links, hotlines and icons (public). Icons hosted at `/static/apps/`. |
| 2026-10-24 | Prediction: `/predict/routes/{from}/{to}` and `/predict/places/{id}` (any date; probability per departure, weekday pattern, live sea forecast; checked on held-out days). Demo contacts: `/places/{id}/contacts`. All public. |
| 2026-10-24 | `/harbour/boats/{code}/timeline` (policy): distance from Male every 30 minutes, stops, trips and projected next trip per North Harbour boat. |
| 2026-10-24 | `/airport-taxi-fares` and `/hotlines` (emergency and transport numbers), public. |
| 2026-10-24 | `/bus-routes` and `/bus-ridership` (sample passenger figures from the organiser's MTCC file), public. |
