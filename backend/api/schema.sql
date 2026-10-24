-- Maasinga database. Every table is filled by seed.py from the pipeline's output files.
-- Times are Maldives local time (UTC+5). Coordinate arrays are degrees x 10,000 as integers.
-- Boat codes are coded IDs (6 characters of an MD5 of the tracker); no real tracker ID is stored.

DROP SCHEMA IF EXISTS maasinga CASCADE;
CREATE SCHEMA maasinga;
SET search_path TO maasinga;

-- Small summaries and settings that are a single value or object (totals, thresholds, outlines).
CREATE TABLE meta (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

-- Islands (Census 2022 + OpenStreetMap) and other sites where boats stop.
CREATE TABLE places (
  id    text PRIMARY KEY,           -- "K.Maafushi", or "S012" for a site
  kind  text NOT NULL,              -- island | site
  name  text NOT NULL,
  atoll text,
  lat   double precision NOT NULL,
  lon   double precision NOT NULL,
  pop   integer,                    -- residents (Census 2022), islands only
  boats integer NOT NULL,           -- tracked boats that stopped here
  region  text,                     -- sea region: north | central | midsouth | south
  web_id  integer,                  -- island id in the team's web app (web/src/data/islands.json)
  name_dv text                      -- Dhivehi name (from the team's web app)
);

-- Routes with 20 or more trips in August 2025.
CREATE TABLE routes (
  from_id    text NOT NULL REFERENCES places(id),
  to_id      text NOT NULL REFERENCES places(id),
  trips      integer NOT NULL,
  boats      integer NOT NULL,
  median_min double precision NOT NULL,
  late_pct   double precision,      -- share of positions with no phone signal
  main_type  text NOT NULL,         -- fast | dhoni | slow
  PRIMARY KEY (from_id, to_id)
);

-- Usual departures: 15-minute slots used on 30% or more of the 31 days.
CREATE TABLE route_departures (
  from_id text NOT NULL,
  to_id   text NOT NULL,
  time    text NOT NULL,            -- "HH:MM"
  days    integer NOT NULL,         -- days in August it ran on
  PRIMARY KEY (from_id, to_id, time),
  FOREIGN KEY (from_id, to_id) REFERENCES routes
);

CREATE TABLE route_hours (
  from_id    text NOT NULL,
  to_id      text NOT NULL,
  hour       smallint NOT NULL,
  departures integer NOT NULL,
  PRIMARY KEY (from_id, to_id, hour),
  FOREIGN KEY (from_id, to_id) REFERENCES routes
);

-- The GPS track of the most typical trip on each route.
CREATE TABLE route_paths (
  from_id text NOT NULL,
  to_id   text NOT NULL,
  coords  integer[] NOT NULL,       -- [lon, lat, lon, lat, ...]
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE route_boats (
  from_id    text NOT NULL,
  to_id      text NOT NULL,
  boat_code  text NOT NULL,
  boat_type  text NOT NULL,
  trips      integer NOT NULL,
  median_min integer NOT NULL,
  last_seen  date NOT NULL,
  rank       integer NOT NULL,      -- order as built (most trips first)
  PRIMARY KEY (from_id, to_id, boat_code)
);

-- Travel Index: boat departures a week per 1,000 residents.
CREATE TABLE travel_index (
  code     text PRIMARY KEY,
  island   text NOT NULL,
  atoll    text NOT NULL,
  pop      integer NOT NULL,
  dep_week double precision NOT NULL,
  boats    integer NOT NULL,
  dests    integer NOT NULL,
  idx      double precision NOT NULL,
  rank     integer NOT NULL
);

CREATE TABLE daily_trips (
  day          date PRIMARY KEY,
  trips        integer NOT NULL,
  island_trips integer NOT NULL
);

-- Sea Pace Index: boat speed against each boat's own normal speed.
CREATE TABLE sea_regions (
  region    text PRIMARY KEY,       -- north | central | midsouth | south
  name      text NOT NULL,
  lat       double precision NOT NULL,
  lon       double precision NOT NULL,
  r_daily   double precision NOT NULL,
  slope     double precision NOT NULL,
  intercept double precision NOT NULL,
  r_gust    double precision NOT NULL,
  days      integer NOT NULL,
  r_hourly  double precision NOT NULL,
  hours     integer NOT NULL,
  rough_wave double precision NOT NULL,
  points    jsonb NOT NULL            -- weather points of the region, [[lat, lon], ...]
);

CREATE TABLE sea_days (
  day    date NOT NULL,
  region text NOT NULL REFERENCES sea_regions(region),
  idx    double precision NOT NULL,
  kn     double precision NOT NULL,
  boats  integer NOT NULL,
  wave   double precision NOT NULL,
  gust   double precision NOT NULL,
  rain   double precision NOT NULL,
  rough  boolean NOT NULL,
  PRIMARY KEY (day, region)
);

CREATE TABLE sea_cells (
  day   date NOT NULL,
  lon   double precision NOT NULL,
  lat   double precision NOT NULL,
  idx   double precision NOT NULL,
  boats integer NOT NULL,
  ord   integer NOT NULL
);
CREATE INDEX sea_cells_day ON sea_cells (day);

-- Safety: crossings between atolls in rough sea.
CREATE TABLE safety_days (
  day             date PRIMARY KEY,
  trips           integer NOT NULL,
  crossings       integer NOT NULL,
  rough_crossings integer NOT NULL,
  night_crossings integer NOT NULL
);

CREATE TABLE rough_routes (
  rank     integer PRIMARY KEY,
  from_id  text NOT NULL,
  to_id    text NOT NULL,
  region   text NOT NULL,
  trips    integer NOT NULL,
  days     integer NOT NULL,
  night    integer NOT NULL,
  max_wave double precision NOT NULL,
  from_lon double precision NOT NULL,
  from_lat double precision NOT NULL,
  to_lon   double precision NOT NULL,
  to_lat   double precision NOT NULL
);

CREATE TABLE fullspeed_boats (
  rank       integer PRIMARY KEY,
  boat_code  text NOT NULL,
  region     text NOT NULL,
  rough_days integer NOT NULL,
  idx        double precision NOT NULL,
  max_wave   double precision NOT NULL
);

-- Phone signal at sea: positions that reached the server more than 5 minutes late.
CREATE TABLE signal_cells (
  ord       integer PRIMARY KEY,
  lon       double precision NOT NULL,
  lat       double precision NOT NULL,
  late_pct  double precision NOT NULL,
  positions integer NOT NULL,
  boats     integer NOT NULL
);

CREATE TABLE dead_zones (
  rank     integer PRIMARY KEY,
  name     text NOT NULL,
  cells    integer NOT NULL,
  km       integer NOT NULL,
  boats    integer NOT NULL,
  late_pct double precision NOT NULL,
  lon      double precision NOT NULL,
  lat      double precision NOT NULL
);

CREATE TABLE signal_worst (
  rank  integer PRIMARY KEY,
  lat   double precision NOT NULL,
  lon   double precision NOT NULL,
  pct   double precision NOT NULL,
  boats integer NOT NULL,
  near  text NOT NULL,
  atoll text NOT NULL,
  km    double precision NOT NULL
);

-- Male North Harbour (team-drawn outline, stored in meta).
CREATE TABLE harbour_boats (
  rank        integer PRIMARY KEY,
  boat_code   text NOT NULL UNIQUE,
  boat_type   text NOT NULL,
  stays       integer NOT NULL,
  trips_in    integer NOT NULL,
  trips_aug   integer NOT NULL,
  median_min  integer NOT NULL,
  longest_min integer NOT NULL,
  hours       double precision NOT NULL,
  days        integer NOT NULL,
  day_list    integer[] NOT NULL,
  origins     jsonb NOT NULL          -- [[place id, trips], ...]
);

CREATE TABLE harbour_origins (
  rank     integer PRIMARY KEY,
  place_id text NOT NULL,
  name     text NOT NULL,
  lat      double precision NOT NULL,
  lon      double precision NOT NULL,
  trips    integer NOT NULL
);

CREATE TABLE harbour_hours (
  hour     smallint PRIMARY KEY,
  arrivals integer NOT NULL
);

CREATE TABLE harbour_days (
  day   date PRIMARY KEY,
  boats integer NOT NULL
);

-- Every moving boat on one calm and one rough day, for the replay.
CREATE TABLE replay_segments (
  label      text NOT NULL,           -- calm | rough
  ord        integer NOT NULL,
  boat_class smallint NOT NULL,       -- 0 speedboat, 1 dhoni, 2 slow boat
  times      integer[] NOT NULL,      -- minutes after midnight
  coords     integer[] NOT NULL,      -- [lon, lat, ...]
  PRIMARY KEY (label, ord)
);

-- OpenStreetMap base map layers as GeoJSON.
CREATE TABLE boat_names (
  code text PRIMARY KEY,              -- coded boat ID
  name text NOT NULL                  -- display name (demo: best guess from the team's name list)
);

CREATE TABLE map_layers (
  name    text PRIMARY KEY,           -- land | reefs
  geojson jsonb NOT NULL
);

-- ---------- App data (pipeline step 11) ----------

-- Every trip in August 2025: one boat from one place to another.
CREATE TABLE trips (
  boat_code text NOT NULL,
  from_id   text NOT NULL,
  to_id     text NOT NULL,
  dep       timestamp NOT NULL,       -- departure, local time
  minutes   integer NOT NULL,
  slot      text NOT NULL             -- 15-minute departure slot "HH:MM", as used by route_departures
);
CREATE INDEX trips_route ON trips (from_id, to_id, dep);
CREATE INDEX trips_to ON trips (to_id, dep);
CREATE INDEX trips_boat ON trips (boat_code, dep);
CREATE INDEX trips_dep ON trips (dep);

-- One row per boat that made a trip.
CREATE TABLE boats (
  code      text PRIMARY KEY,
  name      text NOT NULL,            -- demo: best guess from the team's name list
  type      text NOT NULL,            -- fast | dhoni | slow
  kind      text,                     -- vessel kind from the team's name list (Speed Boat, Supply Dhoni, ...)
  operator  text,                     -- operator from the team's name list
  home      text,                     -- place it stopped at most
  trips     integer NOT NULL,
  routes    integer NOT NULL,
  days      integer NOT NULL,         -- days in August with a trip
  first_day date NOT NULL,
  last_day  date NOT NULL
);
CREATE INDEX boats_home ON boats (home);

-- Weather per sea region (ERA5 gusts, ERA5-Ocean waves, NASA IMERG rain), local time.
CREATE TABLE weather_hourly (
  region text NOT NULL,
  t      timestamp NOT NULL,
  wave   double precision,            -- metres, highest over the region's points
  gust   double precision,            -- knots, highest over the region's points
  PRIMARY KEY (region, t)
);

CREATE TABLE weather_daily (
  region text NOT NULL,
  day    date NOT NULL,
  wave   double precision,
  gust   double precision,
  rain   double precision,            -- mm, mean over the region
  PRIMARY KEY (region, day)
);

-- Transport apps (taxi, ferry tickets) with store links and hotlines, from api/apps.json (curated by the team).
CREATE TABLE apps (
  id              text PRIMARY KEY,
  category        text NOT NULL,      -- taxi | ferry
  name            text NOT NULL,
  name_dv         text,
  blurb_en        text,
  blurb_dv        text,
  color           text,
  initials        text,
  icon            text,               -- file in api/static/apps
  ios_url         text,
  android_package text,
  web_url         text,
  hotline         text,
  places          text[],             -- place ids it serves; NULL = every island
  ord             integer NOT NULL
);

-- DEMO contacts per island (pipeline step 11): placeholder numbers 7XXXXXX / 9XXXXXX, except the MTCC hotline 1650.
CREATE TABLE contacts (
  place_id text NOT NULL,
  category text NOT NULL,             -- cargo | speedboat | ferry | shop
  name     text NOT NULL,
  phone    text NOT NULL,
  ord      integer NOT NULL
);
CREATE INDEX contacts_place ON contacts (place_id);

-- Per North Harbour boat: distance from Male every 30 minutes, stops, trips and the projected next trip (pipeline step 13).
CREATE TABLE harbour_timelines (
  code text PRIMARY KEY,
  data jsonb NOT NULL                 -- {t0, step_min, km[], stops[], trips[], projection}
);
