# Maasinga

Sea mobility for the Maldives, built from the GPS of 1,776 boats (FollowMe, August 2025), with
ERA5 and NASA IMERG weather, the 2022 Census and OpenStreetMap.

This repo has two parts:

| Folder | What it is | Details |
|---|---|---|
| `backend/` | Data pipeline, PostgreSQL database, the Maasinga API (FastAPI) and its own dashboard | [backend/README.md](backend/README.md), [backend/docs/SETUP.md](backend/docs/SETUP.md) |
| `weather/` | The team's weather collector and its data export (ERA5, NASA IMERG, live weather) | [weather/README.md](weather/README.md) |
| `web/` | The public trip planner (mobile-first, English and Dhivehi) and the **policy dashboard** at `/policy`, behind the API's login | this file, [web/API_GAPS.md](web/API_GAPS.md) |

The final database is committed as a dump: [`backend/data/db/maasinga_db_2026-10-24.sql.gz`](backend/data/db/maasinga_db_2026-10-24.sql.gz).

## The problem

People travel between islands every day by speedboat, dhoni and ferry: to hospital, work, school and shops.
Schedules live in Viber groups and in people's heads, and decision-makers see only their own area, after the fact.
Maasinga reads the boats themselves (FollowMe GPS trackers) to show when boats really leave, how rough the
sea is, who still crosses in rough weather, where boats lose phone signal, and which islands get too few boats.
For passengers it's a trip planner; for policy makers it's a dashboard. Full write-up, method and limits:
[backend/README.md](backend/README.md).

## Data sources

| Source | Type | Used for |
|---|---|---|
| FollowMe boat GPS, August 2025 (17.4M positions, 1,776 trackers) | Organiser dataset (MBS) | Trips, routes, usual departures, predictions, Sea Pace Index, safety, signal dead zones, harbour |
| MTCC bus and ferry file | Organiser dataset (MBS) | Bus route R7 and bus ridership (its passenger figures are randomly generated sample data, per the file) |
| Avas rides, MACL airport traffic | Organiser datasets (MBS) | Explored only (`backend/pipeline/09_taxi.py`); not shown in the apps |
| MBS Census 2022, Table P3 | Public | Island population, census island names |
| OpenStreetMap (via Overpass), ODbL | Public | Island positions, land, reefs and resort names |
| Wikidata, CC0 | Public | Matching island names only (no coordinates) |
| Open-Meteo: ERA5 wind gusts, ERA5-Ocean waves (Copernicus / ECMWF), CC BY 4.0 | Public, collected by the team's weather collector | Wind and waves, August 2025 |
| NASA GPM IMERG daily rain | Public, collected by the team's weather collector | Rain per day |
| Open-Meteo Marine forecast, CC BY 4.0 | Public, live | The 3-day sea rating in the apps |
| maldivesairport.com, mtcc.mv and Maldives news sites (see.mv, raajje.mv) | Public | Airport taxi fares, Greater Malé bus routes |
| App Store and Google Play listings, public hotlines | Public | Taxi and RTL Travel app links and icons; 1655, 1650, 119, 102, 118 |
| Team lists | Team | Boat display names (best guesses, demo only), Dhivehi island names, demo quick contacts (placeholder numbers) |

Raw tracker IDs are replaced by a short hash and are not published. Full URLs and caveats:
[backend/pipeline/reference/SOURCES.md](backend/pipeline/reference/SOURCES.md).

## Tools

Python, DuckDB, FastAPI, PostgreSQL, Docker, Next.js 16, React 19, Tailwind CSS 4, TypeScript, deck.gl,
GitHub, and the Crundi dev server (hosting the services during development).

## AI tools

**Claude Code (Anthropic)** was used to:
- write the data pipeline, the API and both web apps (public trip planner and policy dashboard) from the team's
  designs and instructions, and to fix bugs found in testing;
- find and check public reference data (census, OpenStreetMap, app store links, bus routes, airport fares);
- draft the Dhivehi interface text (reviewed by the team);
- check results and test the full suite (restore the database, run the API and the apps, log in).

The team reviewed the output; every number in the apps comes from the pipeline scripts in this repository.

## Live demo

| What | Address |
|---|---|
| Public trip planner (open it on a phone) | https://maasinga-web.dev.faruhaan.com |
| Policy dashboard (login given in the submission form) | https://maasinga-web.dev.faruhaan.com/policy |
| API and its interactive docs | https://maasinga-api.devoup.com/docs |

## How it fits together

```
PostgreSQL  ──  Maasinga API (FastAPI, :8000)  ──┬──  web/  public app + /policy dashboard   (Next.js)
 (the dump)        public routes + logins         └──  backend/dashboard/  (optional, Next.js)
```

- The **public app** (`web/`) calls the API's public routes straight from the browser.
- The **policy dashboard** (`web/` at `/policy`) logs in through the web app's own server routes, which keep the API token in an httpOnly cookie and call the protected API routes from the server.

## Default login

| Username | Password | Role |
|---|---|---|
| `admin` | given to the judges in the submission form (not stored in this repo) | `admin` (sees the policy dashboard at `/policy` and can manage users) |

The dump has **no users in it** (`auth.users` is empty), so step 2 below creates this login: choose your own
password where the commands say `YOUR_ADMIN_PASSWORD`.
More logins: `python users.py add <name>` (role `policy`), `python users.py list`, `python users.py remove <name>`.

## Run the full suite

Tested end to end on 24 October 2026: restore the dump, run the API, log in, run the web app and open the policy dashboard.

You need: Python 3.11+, Node.js 20+ (npm), PostgreSQL 14+ (or Docker), and `gunzip` and `psql`.

### 1. Database: restore the final dump

Restore into an **empty** database: the dump creates the `maasinga` and `auth` schemas itself.

**With Docker** (from `backend/deploy/`, after `cp .env.example .env` and setting `POSTGRES_PASSWORD`, `JWT_SECRET`):

```bash
cd backend/deploy
docker compose down -v                  # only if an older database exists: starts from an empty volume
docker compose up -d db                 # just the database
gunzip -c ../data/db/maasinga_db_2026-10-24.sql.gz \
  | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U maasinga -d maasinga
```

**Without Docker**:

```bash
createuser maasinga --pwprompt          # choose a password (on Ubuntu: sudo -u postgres createuser ...)
createdb maasinga --owner maasinga
gunzip -c backend/data/db/maasinga_db_2026-10-24.sql.gz \
  | psql -v ON_ERROR_STOP=1 "postgresql://maasinga:PASSWORD@localhost:5432/maasinga"
```

Check: `psql ... -c "select count(*) from maasinga.trips"` gives **68840** (and 508 places, 654 routes, 1613 boats).

> The other way to fill the database is `backend/api/seed.py`, which loads the 20 files in `backend/data/out`
> (that's what `docker compose up` does through its `seed` service). Use the dump for the exact final data.

### 2. API

**With Docker** (skip the seed service so it doesn't reload over the dump):

```bash
cd backend/deploy
docker compose up -d --no-deps api dashboard
docker compose exec -e PASSWORD='YOUR_ADMIN_PASSWORD' api python users.py add admin --role admin
```

**Without Docker**:

```bash
cd backend/api
cp .env.example .env                    # set DATABASE_URL (password from step 1) and JWT_SECRET
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
PASSWORD='YOUR_ADMIN_PASSWORD' .venv/bin/python users.py add admin --role admin
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check:

```bash
curl http://localhost:8000/health       # {"ok":true,"routes":654}
curl -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}'     # {"access_token": ..., "user": {...}}
```

Interactive API docs: http://localhost:8000/docs. Every endpoint with example answers: [backend/docs/API.md](backend/docs/API.md).

`CORS_ORIGINS` (API `.env`) must allow the web app's address, for example `http://localhost:3001`, or `*` on your own computer.

### 3. Web app (public app + policy dashboard)

```bash
cd web
cp .env.example .env.local              # point it at your API (below)
npm install --include=dev               # --include=dev matters if NODE_ENV=production is set in your shell
```

`.env.local` for an API on the same machine:

```bash
NEXT_PUBLIC_MAASINGA_API=http://localhost:8000   # what the browser calls; built in at build time
MAASINGA_API=http://127.0.0.1:8000               # what the web server calls for /policy; read at runtime
```

Without a `.env.local`, both use the hosted API at `https://maasinga-api.devoup.com`.

Development (port 3001, so it doesn't clash with the backend dashboard on 3000):

```bash
npm run dev -- -H 127.0.0.1 -p 3001
```

Production:

```bash
npm run build
npm start -- -H 127.0.0.1 -p 3001
```

Open:
- http://localhost:3001: the public app. It asks for your location (or pick an island), then "What would you like to find?"
- http://localhost:3001/policy: the policy dashboard. Log in as `admin` with the password you set in step 2.

### 4. Backend dashboard (optional)

The backend has its own dashboard (`backend/dashboard`, port 3000), started by Docker in step 2 or with
`pnpm install && pnpm dev` (see [backend/docs/SETUP.md](backend/docs/SETUP.md)). It logs in with the same users.

## How we ran it on the team's dev server

The development server runs everything as Crundi services:

| Service | Command (folder) | Port | Address |
|---|---|---|---|
| `maasinga-web-prod` | `NODE_ENV=production npm run build && NODE_ENV=production npx next start -H 127.0.0.1 -p 4311` (`web/`) | 4311 | https://maasinga-web.dev.faruhaan.com (public) |
| `maasinga-web` | `NODE_ENV=development npx next dev -H 127.0.0.1 -p 4310` (`web/`) | 4310 | https://maasinga-dev.dev.faruhaan.com (team only, Crundi sign-in) |
| API | hosted separately | | https://maasinga-api.devoup.com |

- Changes show up on the dev address at once. The public address picks them up when `maasinga-web-prod` restarts (it rebuilds, about 30 seconds).
- The weather collector (`weather/`: ERA5, IMERG and live weather; how it works in [weather/README.md](weather/README.md)) runs on that server as the `weather-live` service. Its export in `weather/export` is the team's self-collected weather data the backend uses.

## Troubleshooting

| Problem | Fix |
|---|---|
| `tsc` or `eslint` "not found", or `Cannot find module '@tailwindcss/turbopack'` | Dev packages were skipped because `NODE_ENV=production`: run `npm install --include=dev`, then delete `web/.next` and restart. |
| New Tailwind classes have no effect in `next dev` | Restart the dev server (Turbopack's CSS cache). |
| The public app shows "Couldn't load" | The API isn't reachable from the browser, or `CORS_ORIGINS` doesn't include the web app's address. |
| `/policy` login says the API can't be reached | Set `MAASINGA_API` to an address the web **server** can reach, and restart it. |
| Restoring the dump fails with "already exists" | The database isn't empty: restore into a new database (or `docker compose down -v` first). |

## More

- [backend/README.md](backend/README.md): what the data shows, the pipeline, data sources and limits.
- [backend/docs/SETUP.md](backend/docs/SETUP.md): every backend setting, deploying on a server, rebuilding the data.
- [backend/docs/API.md](backend/docs/API.md) and [backend/docs/DATA.md](backend/docs/DATA.md): API and data reference.
- [web/API_GAPS.md](web/API_GAPS.md): what the web app still needs from the API.
