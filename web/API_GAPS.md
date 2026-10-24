# What the web app needs from the API

The public app reads everything it can from the Maasinga API
(`https://maasinga-api.devoup.com`). This list is what it still can't, so it
can be built on the API side. In the app, every section below carries an amber
**Not in API yet** tag (`<ApiGap>` / `DashSection gap=`), so they're easy to
find on screen and in code (`grep -rn "gap=" src`).

## Sections on screen that aren't from the API

| Section | Where | Now | What the API should provide |
|---|---|---|---|
| Quick Contact | Every island except Malé City | From `/places/{id}/contacts`, tagged "Demo" (the API marks it `demo: true`) | Real contacts: operators, cargo agents, shops, with the operators' consent. |

## Data the app shows in a reduced form

| What | Now | What the API should provide |
|---|---|---|
| Boat status (in harbour, loading, on the way, ETA) | Removed. "Boats serving" shows each boat's next usual departure instead. | Live positions and a status per boat: last seen time and place, state, next stop, ETA. |
| Schedule dates | Predicted departures from `/predict/...` (August patterns + live sea forecast), with likelihood. | Operator timetables with dates, plus cancellations (weather, breakdowns). |
| Cargo | "Send cargo" uses dhoni and slow boats as a stand-in. | A cargo flag per boat, or per trip, and cargo operators. |
| Island codes | The big code on cards is the atoll code (`K`, `AA`, `MLE`). | Official island codes (as in the concept: T10, C13). |
| Boat names | English only; names are "demo only" guesses. | Verified names from a vessel register, with Dhivehi names (the cards are designed for them). |
| Departure point | Not shown. | Jetty or berth per departure (the concept shows "NH - Beyruthoshi"). |
| Fares | Not shown. | Fare per route and boat type. |
| Boat page, boat search | Not built: `/boats`, `/boats/{code}`, `/trips` and `/boat-names` now need a login. | Public versions of these, if the public app should have them. |
| 11 islands with no boat data | Selectable, but the app says there's no boat data. | HA Filladhoo, HDh Kunburudhoo, HDh Maavaidhoo, Lh Felivaru, Dh Thinhuraa, Dh Vaanee, L Gaadhoo, L Kalaidhoo, GA Dhiyadhoo, GDh Maathodaa, S Meedhoo. |
| Atoll names in Dhivehi | A small translation table in `src/lib/islands.tsx`. | `atoll_dv` on places. |

## Data the API has that the app doesn't use yet

- `/routes/{from}/{to}` `path`: the GPS track of a typical trip, for a route map (needs a map library).
- `/boats/{code}`: a boat page with its routes, usual times and recent trips.
- `/places/{id}/schedule` `arrivals`: an arrivals board.
- `/harbour/boats/{code}/timeline` (login): one harbour boat's August track, stops and projected next trip. Not shown in the policy dashboard yet; its response shape isn't in the docs.
- `/hotlines?category=transport`: taxi line and MTCC numbers (Malé City shows only emergency numbers, by choice).
- `/port` data: the repo's port collector (Maldives Ports Limited queue) isn't in the API.

## Policy dashboard (`/policy`, behind login)

Built as its own section of the web app with its own layout: `/policy/login`
and the dashboard at `/policy`. The API token from `POST /auth/login` lives in
an httpOnly cookie; the browser only talks to `/policy/api/*`, which adds the
token server-side and allows only the policy paths.

Still needed from the API:

- **Organisations.** Users have only a `role` (`policy` / `admin`). Users need
  an organisation, and the dataset endpoints need to filter by it, so each
  organisation sees its own scope.
- **Response shapes for `/auth/login` and `/auth/me`** in the docs (the app
  accepts `token` or `access_token`, and shows `username` and `role`).
- **An index per boat type, and later per people and goods** (needs a cargo flag per boat or trip).
- **Queries instead of whole files:** date range, region and atoll filters, CSV
  export, and a methodology / data period description per index.
