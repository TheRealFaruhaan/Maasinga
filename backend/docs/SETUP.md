# Maasinga: setup and deployment guide

This guide takes you from a fresh clone to a running Maasinga: database, API and dashboard.
Everything lives in the `backend/` folder of the repo. **Run every command from `backend/`** unless a
step says otherwise.

Live copy: dashboard https://maasinga.devoup.com, API https://maasinga-api.devoup.com/docs

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Quick start with Docker (recommended)](#2-quick-start-with-docker-recommended)
3. [Run without Docker](#3-run-without-docker)
4. [Deploy on a server](#4-deploy-on-a-server)
5. [Rebuild the data from the raw files (optional)](#5-rebuild-the-data-from-the-raw-files-optional)
6. [Settings reference (.env files)](#6-settings-reference-env-files)
7. [API reference](#7-api-reference)
8. [Troubleshooting](#8-troubleshooting)

## 1. How it fits together

```
FollowMe boat GPS (organiser) + team weather export (ERA5, NASA IMERG) + Census 2022 + OpenStreetMap
        |
   pipeline/    Python + DuckDB. Turns 1.8 GB of raw GPS into 19 small data files.
        |        The 19 files are committed in data/out, so you do NOT need this step to run the app.
        v
   api/         seed.py loads the 19 files into PostgreSQL (tables: api/schema.sql).
        |        FastAPI serves them. Interactive docs at /docs.
        v
   dashboard/   Next.js dashboard behind a login. Reads everything from the API.
```

| Folder | What it is |
|---|---|
| `pipeline/` | Data processing scripts (step 01 to 13) and public reference data (`pipeline/reference/`) |
| `api/` | FastAPI app, database schema, seed script, Dockerfile, `.env.example` |
| `dashboard/` | Next.js dashboard, its Dockerfile and `.env.example` |
| `deploy/` | Docker Compose files, `.env.example`, Traefik route example |
| `docs/` | This guide, `DATA.md` (every data file, field by field) and `API.md` (every endpoint, logins) |
| `data/` | `data/out`: the 19 processed data files (in git). `data/raw`, `data/work`: organiser data and working files (not in git; only for section 5) |

## 2. Quick start with Docker (recommended)

You need Docker with the Compose plugin:
- macOS or Windows: install Docker Desktop from https://www.docker.com/products/docker-desktop/ and start it.
- Linux: `curl -fsSL https://get.docker.com | sh`, then log out and in again (or use `sudo` before each `docker` command).

Check: `docker compose version` prints a version.

Steps:

```bash
cd deploy
cp .env.example .env
```

Open `deploy/.env` and set:
- `POSTGRES_PASSWORD`: any password (for example the output of `openssl rand -hex 24`).
- `JWT_SECRET`: a long random value that signs login tokens (`openssl rand -hex 32`).
- `ADMIN_PASSWORD`: the password for the first login, user `admin` (8 or more characters).

Leave the other values as they are for a local run.

```bash
docker compose up -d --build
```

The first build takes 3 to 6 minutes. It starts four services:

| Service | What it does | Address |
|---|---|---|
| `db` | PostgreSQL 16; data kept in the Docker volume `pgdata` | inside Docker only |
| `seed` | Loads the 19 data files into the database, then stops | - |
| `api` | Maasinga API | http://localhost:8000 (docs: http://localhost:8000/docs) |
| `dashboard` | Maasinga dashboard | http://localhost:3000 |

Check that it works:

```bash
docker compose ps                         # db, api and dashboard "running"; seed "exited (0)"
curl http://localhost:8000/health         # {"ok":true,"routes":654}
```

Then open http://localhost:3000 and sign in as `admin` with your `ADMIN_PASSWORD`.

More logins (role `policy` sees the dashboard and protected API routes; `admin` can also manage users):

```bash
docker compose exec api python users.py add alice                 # asks for the password; role policy
docker compose exec api python users.py add bob --role admin
docker compose exec api python users.py list
docker compose exec api python users.py remove alice
```

Users are kept in the `auth` schema and survive every seed. Admins can also manage users through the API (`/auth/users`, see `docs/API.md`).

Everyday commands (from `deploy/`):

```bash
docker compose logs -f api               # follow the API log
docker compose down                      # stop everything (data stays in the volume)
docker compose down -v                   # stop and delete the database volume
docker compose run --rm seed             # reload the data after the pipeline runs again
docker compose restart api               # then restart the API (it keeps data in memory)
```

## 3. Run without Docker

You need:
- Python 3.11 or newer: https://www.python.org/downloads/
- Node.js 20 or newer: https://nodejs.org/ and pnpm: `npm install -g pnpm` (or `corepack enable`)
- PostgreSQL 14 or newer: macOS `brew install postgresql@16 && brew services start postgresql@16`;
  Ubuntu `sudo apt install postgresql`; Windows https://www.postgresql.org/download/

### 3.1 Database

```bash
createuser maasinga --pwprompt            # choose a password
createdb maasinga --owner maasinga
```

(On Ubuntu run these as the postgres user: `sudo -u postgres createuser ...`.)

### 3.2 API

```bash
cd api
cp .env.example .env                      # set DATABASE_URL (password from 3.1), JWT_SECRET and ADMIN_PASSWORD
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt           # Windows: .venv\Scripts\pip install -r requirements.txt
.venv/bin/python seed.py                            # loads ../data/out (about 2 seconds) and creates the admin login
.venv/bin/python users.py add alice                 # optional: more logins
.venv/bin/uvicorn app.main:app --port 8000          # http://localhost:8000/docs
```

`seed.py` can be run again at any time; it drops and recreates the `maasinga` schema.

### 3.3 Dashboard (in a second terminal)

```bash
cd dashboard
cp .env.example .env.local                # NEXT_PUBLIC_API_URL=http://localhost:8000
pnpm install
pnpm dev                                  # http://localhost:3000
```

For production, use Docker (section 2 or 4): it builds the dashboard as a standalone server.

The dashboard needs the API and a login. The live wave forecast on Plan a trip needs internet (Open-Meteo).

## 4. Deploy on a server

### 4.1 Plain server (any Linux VPS)

1. Install Docker: `curl -fsSL https://get.docker.com | sh`
2. Copy the repo to the server (`git clone ...`) and go to `backend/deploy`.
3. `cp .env.example .env` and set:
   - `POSTGRES_PASSWORD`: a long random value (`openssl rand -hex 24`)
   - `PUBLIC_API_URL`: the public HTTPS address of the API, for example `https://maasinga-api.your-domain.com`
   - `CORS_ORIGINS`: the dashboard address, for example `https://maasinga.your-domain.com`
4. `docker compose up -d --build`
5. Put HTTPS in front of port 3000 (dashboard) and port 8000 (API). Two common ways:
   - **Caddy** (gets certificates automatically). `/etc/caddy/Caddyfile`:
     ```
     maasinga.your-domain.com {
       reverse_proxy localhost:3000
     }
     maasinga-api.your-domain.com {
       reverse_proxy localhost:8000
     }
     ```
     Point both DNS names (A record) to the server and open ports 80 and 443
     (on Oracle Cloud: the VCN security list and `sudo iptables` / `ufw`).
   - **Cloudflare Tunnel** (no open ports): `cloudflared tunnel create maasinga`, then
     `cloudflared tunnel route dns maasinga maasinga.your-domain.com` (and the API name), with ingress rules
     `maasinga.your-domain.com -> http://localhost:3000` and `maasinga-api.your-domain.com -> http://localhost:8000`.
6. Open the dashboard address and check `https://maasinga-api.your-domain.com/health`.

`PUBLIC_API_URL` is built into the dashboard image. After changing it run `docker compose up -d --build dashboard`.

Use one-level subdomains (`maasinga-api.your-domain.com`, not `api.maasinga.your-domain.com`) if you are
behind Cloudflare: its standard certificate covers only one level.

### 4.2 Server that already runs Traefik (for example Dokploy)

This is how the live copy runs. The API and dashboard join the existing `dokploy-network` with no host
ports, and Traefik routes to them by container name:

```bash
cd deploy
cp .env.example .env                      # set the values as in 4.1
docker compose -p maasinga -f docker-compose.yml -f docker-compose.server.yml up -d --build
# edit the host names in traefik-maasinga.yml, then:
sudo cp traefik-maasinga.yml /etc/dokploy/traefik/dynamic/maasinga.yml
```

Traefik loads the route file on its own. Then point the two host names to the server.

### 4.3 Update a running server

Copy the new code to the server, then from `deploy/` run the same `docker compose ... up -d --build` command.
The seed runs again on every `up`, so the database always matches `data/out`.

## 5. Rebuild the data from the raw files (optional)

Only needed to change the analysis. The organisers' data is not in git (1.8 GB). Place it like this:

```
backend/data/raw/FollowMe/FollowMe_august_2025/1.csv ... 31.csv     (FollowMe GPS, August 2025)
```

(Other organiser files are optional: step `09_taxi.py` uses them and is skipped when they are missing:
`data/raw/Avas_Ride/avas_rides_aug_sep_2026.csv`, `data/raw/Avas_Ride/car_fare_matrix.csv`,
`data/raw/MACL/MACL/Airport traffic_Dataset_27092026.csv`.)

Then, from `backend/`:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt           # duckdb
.venv/bin/python pipeline/run_all.py                # about 20 seconds
```

This writes the 19 files to `data/out` and the per-boat harbour table (with real tracker IDs,
not shared) to `data/work/`. Then reload the database: `docker compose run --rm seed && docker compose restart api`
(Docker) or `api/.venv/bin/python api/seed.py` and restart the API (no Docker).

To read the raw data from another folder set `MAASINGA_RAW=/path/to/raw` before running the pipeline.
Weather, Census 2022 and OpenStreetMap files are already in `pipeline/reference/`, so no internet is needed.
Step 02 rebuilds them from the team weather export in `weather/export` (repo root) when it is there; if not, it keeps the committed files.

## 6. Settings reference (.env files)

| File | Used when | Setting | Meaning |
|---|---|---|---|
| `deploy/.env` | Docker Compose | `POSTGRES_PASSWORD` | Database password (required) |
| | | `JWT_SECRET` | Signs login tokens; 32+ random characters (required) |
| | | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | First admin login, made once at seed time |
| | | `PUBLIC_API_URL` | API address as the browser sees it; built into the dashboard |
| | | `CORS_ORIGINS` | Websites allowed to call the API (`*` or a comma list) |
| | | `API_PORT`, `DASHBOARD_PORT` | Host ports (default 8000 and 3000) |
| `api/.env` | API without Docker | `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` |
| | | `CORS_ORIGINS` | As above |
| | | `DATA_DIR` | Folder seed.py loads (default `../data/out`) |
| | | `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | As above |
| | | `TOKEN_HOURS` | How long a login lasts (default 12) |
| `dashboard/.env.local` | Dashboard without Docker | `NEXT_PUBLIC_API_URL` | API address (required) |
| (shell) | Pipeline | `MAASINGA_RAW` | Raw data folder (default `data/raw`) |

Each folder has a commented `.env.example`. Real `.env` files are ignored by git.

## 7. API reference

Interactive, with every field: `/docs` on the running API (OpenAPI JSON at `/openapi.json`).

Every endpoint, with example responses, logins and TypeScript types: [API.md](API.md).
Public routes (trip planning) need no login; boats, trips and the dashboard datasets need a `policy` login.

Tables: `api/schema.sql` (every column is commented). Data fields: `docs/DATA.md`.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `POSTGRES_PASSWORD` or `JWT_SECRET` error on `docker compose up` | You have no `deploy/.env`, or a value is missing. Run `cp .env.example .env` and set them. |
| API stops with "Set JWT_SECRET" | `JWT_SECRET` is missing, shorter than 32 characters, or still the example value. |
| Dashboard says "Wrong username or password" | Create the user: `docker compose exec api python users.py add <name>`. `ADMIN_PASSWORD` is used only when the admin does not exist yet. |
| Port 3000 or 8000 already in use | Change `DASHBOARD_PORT` / `API_PORT` in `deploy/.env` (and `PUBLIC_API_URL` to match), then `docker compose up -d --build`. |
| Sign-in says "The API address is not set" or nothing loads | `PUBLIC_API_URL` was empty or wrong when the dashboard was built. Fix it and run `docker compose up -d --build dashboard`. |
| Browser console shows a CORS error | Add the dashboard address to `CORS_ORIGINS` and run `docker compose up -d api`. |
| `seed` exited with an error | `docker compose logs seed`. Usually the database password changed after the volume was created: run `docker compose down -v` and `up` again. |
| A map shows "The map could not start in this browser" | The browser has no WebGL (or ran out of WebGL contexts). Reload the page or try another browser. |
| Plan a trip says "The forecast needs internet" | The browser cannot reach `marine-api.open-meteo.com`. Everything else still works. |
| Pipeline: `No files found` | The raw data is not in `data/raw/FollowMe/FollowMe_august_2025/`. See section 5. |
