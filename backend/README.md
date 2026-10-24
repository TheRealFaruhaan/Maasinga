# Maasinga

Mobility data for the Maldives, built from the GPS of 1,776 boats.

## The problem

People travel between islands every day by speedboat, dhoni and ferry: to hospital, work, school and shops. Schedules live in Viber groups and in people's heads. Councils, police and atoll offices each see only their own area, and decision-makers hear only after an incident. Nobody can see where the sea is rough right now, which crossings have no phone signal, or which islands get too few boats.

## What Maasinga does

Maasinga reads the boats themselves. Many boats already carry a FollowMe GPS tracker, and that data answers these questions without new hardware or new reporting.

| Page | For | Question it answers | Key result (August 2025) |
|---|---|---|---|
| Overview `/` | Everyone | What are the main findings? | One number per topic |
| Travel `/travel` | Passengers | When do boats leave, is tomorrow's sea safe, is there signal on the way? | Usual departures for 654 routes from 68,840 detected trips |
| Sea state `/sea` | Coast Guard, Met service | How rough is the sea, read from boat speed? | Speedboat pace against wave height: r = -0.90 (North), -0.84 (Male and Ari) |
| Safety `/safety` | Coast Guard, Transport Authority | Who still crosses open sea in rough weather? | Crossings fell only 22% on rough days; 29% of speedboats kept full speed |
| Signal `/signal` | Telecom companies, Coast Guard | Where do boats lose mobile signal? | 73 km with no signal between Gaafu Alif and Laamu, crossed by 69 boats |
| Access `/access` | Island councils, Ministry of Transport | Which islands get too few boats for their population? | Travel Index: boat departures a week per 1,000 residents (Census 2022) |
| Harbour `/harbour` | MPL, Male City Council | Which boats use Male North Harbour, from where, and how long they stay? | 119 boats stayed in August, 98 of them dhonis or ferries; a dhoni typically stays 6 h |
| Method `/method` | Judges | Data, method and limits | |

### API for apps

The same data is served to other apps (the team's public trip planner in `web/`) by the Maasinga API. Every endpoint, with example answers: [docs/API.md](docs/API.md).

- Public (no login): islands, departure and arrival boards, routes with one-stop connections, weather, a live sea rating, transport apps (taxi, RTL ferry tickets) and demo quick contacts.
- **Departure prediction for any date**: the chance of each departure from the August pattern for that weekday, adjusted by the live sea forecast. Checked on 7 days the model did not see: 84% of "very likely" departures ran (within 15 minutes), 64% of "likely" and 42% of "possible".
- With a login (roles `policy` and `admin`): every boat and trip, per-boat North Harbour timelines with the projected next trip, and all dashboard data.

### The new method: the Sea Pace Index

Every speedboat has its own normal cruising speed (its median speed when moving over 15 knots). The Sea Pace Index for a region and hour is the average of each boat's speed divided by its own normal speed. When waves rise, the index falls: about 11% slower per extra metre of wave around Male. So 790 speedboats work as a network of free wave sensors, and the same model turns a wave forecast into a go, take care or avoid rating for each route.

## Folders

- `pipeline/`: Python and DuckDB scripts that turn the raw data into the 20 data files the app and the API use.
- `data/out/`: the 20 processed data files (committed).
- `api/`: FastAPI and PostgreSQL. `seed.py` loads the data files into the database (tables in `schema.sql`); the API serves them (docs at `/docs`). Trip-planning routes are public; boats, trips and the dashboard data need a login (`users.py` manages logins).
- `dashboard/`: the Maasinga dashboard (Next.js), behind a login. Reads everything from the API.
- `deploy/`: Docker Compose for the database, API and dashboard.
- `docs/`: `SETUP.md` (run, deploy, API), `DATA.md` (every data file, field by field) and `API.md` (every endpoint with example responses, for apps that use the API).
Everything above lives in this `backend/` folder; run the commands below from here. The team's public app
is `web/` and the team's weather collector is `weather/` (scripts and export), both at the repo root.

## How to run

With Docker (database, API and dashboard in one command):

```bash
cd deploy
cp .env.example .env      # set POSTGRES_PASSWORD, JWT_SECRET and ADMIN_PASSWORD
docker compose up -d --build
# dashboard: http://localhost:3000 (sign in as admin)   API: http://localhost:8000/docs
```

Full step-by-step guide (Docker, without Docker, deploying on a server, rebuilding the data, every setting,
troubleshooting): [docs/SETUP.md](docs/SETUP.md). Each part has a commented `.env.example`:
`deploy/.env.example` (Docker), `api/.env.example` and `dashboard/.env.example` (without Docker).

The 20 processed data files in `data/out` are committed, so nothing needs the raw organiser data (1.8 GB, not committed) unless you change the analysis.

The app needs no internet except for the live wave forecast (Open-Meteo); without internet it says so and still shows the August data.

## Pipeline

| Step | File | Output |
|---|---|---|
| Clean GPS pings, classify boats by speed | `pipeline/01_ingest.py` | `data/work/pings.parquet` |
| Weather, waves and rain from the team export in `weather/` (cached) | `pipeline/02_weather.py` | `pipeline/reference/weather/*.json` |
| Sea Pace Index against waves | `pipeline/03_sea_sensor.py` | `sea.json` |
| Stops, places and trips | `pipeline/04_trips.py` | `data/work/*.parquet` |
| Routes, timetables, typical paths, Travel Index | `pipeline/05_network.py` | `network.json`, `paths.json` |
| Rough-sea crossings, full speed in rough sea | `pipeline/06_safety.py` | `safety.json` |
| Signal dead zones | `pipeline/07_signal.py` | `signal.json` |
| Boat paths for the replay | `pipeline/08_replay.py` | `replay-calm.json`, `replay-rough.json` |
| Taxi requests with no driver | `pipeline/09_taxi.py` | `taxi.json` |
| Boats in the North Harbour area (team-drawn outline) | `pipeline/analysis/north_harbour.py` | `harbour.json` |
| Boat display names for the demo (team name list, best guesses) | `pipeline/10_boat_names.py` | `boat-names.json` |
| App data for the API: every trip, boats, weather, island links to the web app, demo contacts | `pipeline/11_app_data.py` | `trips.json`, `boats.json`, `weather.json`, `places-extra.json`, `contacts.json` |
| Check of the departure prediction on held-out days | `pipeline/12_predict.py` | `predict-eval.json` |
| Timeline per North Harbour boat: distance from Male, trips, next trip | `pipeline/13_harbour_timeline.py` | `harbour-timelines.json` |
| Bus passengers from the MTCC file (sample data) | `pipeline/14_bus.py` | `bus.json` |
| Offline basemap from OpenStreetMap | `pipeline/basemap/build_basemap.py` | `land.json`, `reefs.json`, `resorts.json` |

Each script starts with a short note on its method and thresholds.

## Data sources

| Source | Used for | Owner and licence |
|---|---|---|
| FollowMe boat GPS, August 2025 (17.4M positions, 1,776 trackers) | Everything at sea | Organiser dataset |
| Avas rides Aug to Sep 2026 and car fare matrix | Explored in `pipeline/09_taxi.py`, not shown in the app | Organiser dataset |
| MACL airport traffic 2012 to Jul 2026 | Explored in `pipeline/09_taxi.py`, not shown in the app | Organiser dataset |
| MTCC bus and ferry | Bus route codes and names; its passenger figures are served by the API only as marked sample data, because the file says they are randomly generated | Organiser dataset |
| Team weather collector (`weather/` at the repo root): ERA5 wind gusts and ERA5-Ocean waves via Open-Meteo | Waves and wind gusts, August 2025 | Open-Meteo, CC BY 4.0 (ECMWF Copernicus data) |
| NASA GPM IMERG daily rain (same export) | Rain per day on the Sea page | NASA, public |
| Open-Meteo Marine API | Live wave forecast on Plan a trip | Open-Meteo, CC BY 4.0 |
| Maldives Bureau of Statistics, Census 2022 Table P3 | Island population | MBS, public |
| OpenStreetMap | Island positions, land, reefs, resort names | OpenStreetMap contributors, ODbL |
| Team boat name list (best guesses per tracker) | Boat names, vessel kind and operator (demo) | Team |
| Team web app (`web/`): island list and transport apps | Dhivehi island names, island ids for the web app, taxi and RTL app links and icons | Team; app links from the App Store and Google Play |

Full URLs and caveats: `pipeline/reference/SOURCES.md`.

No personal data is published. Tracker IDs are replaced by a short hash; the raw tracker IDs (IMEIs) stay on the team's computers.
Boat names are best guesses from the team's list and the quick contacts are demo data with placeholder numbers (7XXXXXX / 9XXXXXX).

## Limits

- One month of boat data (August 2025, southwest monsoon). The model needs other seasons before it is used for warnings.
- Boat type is inferred from speed (speedboat, dhoni or ferry, slow boat).
- Only boats with a FollowMe tracker are counted. The Travel Index is relative, not a full count of all boats. Islands linked by road or air (Addu, Fuvahmulah, Laamu Gan) score low for that reason.
- Weather is the worst value over 5 to 8 sea points per region (0.25 degree grid), not the exact place of each boat.
- A correlation is not proof of cause. The South shows the weakest link (r = -0.39) because its boats run inside wide, sheltered lagoons.
- Stops at sea were tested as a breakdown signal and rejected: they are 2.6 times more common on calm days, so most are leisure stops.
- Departure predictions repeat the August pattern. They cannot know about holidays, breakdowns, new timetables or one-off trips.

## Tools

Python, DuckDB, FastAPI, PostgreSQL, Docker, Next.js 16, React 19, deck.gl 9, d3-scale, Radix UI.

AI tools: Claude Code (Anthropic) was used to write the pipeline and web code, to find and check public reference data (census, OpenStreetMap), and to check results. Every number in the app comes from the pipeline scripts in this repository, and the team reviewed the output.
