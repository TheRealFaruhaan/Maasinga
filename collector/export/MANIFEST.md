# Export of `collector/data/port.sqlite`

Exported 2026-10-24T08:24:19+00:00 (UTC). Gzipped CSV, header row, UTF-8; empty field = NULL.
See weather/DATA_GUIDE.md for what each table means.

| table | rows | from | to | file size |
|---|---:|---|---|---:|
| `berth` | 384 | 2026-10-24T06:29:17+00:00 | 2026-10-24T08:10:13+00:00 | 0.0 MB |
| `event` | 38 | 2026-10-24T07:36:02+00:00 | 2026-10-24T08:10:13+00:00 | 0.0 MB |
| `movement` | 449 | 2026-10-24T06:29:17+00:00 | 2026-10-24T08:10:13+00:00 | 0.0 MB |
| `polls` | 178 | 2026-10-24T06:29:17+00:00 | 2026-10-24T08:24:17+00:00 | 0.0 MB |
| `queue_listing` | 339 | 2026-10-24T06:29:17+00:00 | 2026-10-24T07:44:05+00:00 | 0.0 MB |

## Schema

```sql
CREATE TABLE berth(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, zone TEXT NOT NULL,
  zone_order INTEGER, berth_order INTEGER, orientation INTEGER,
  reg_no TEXT, name TEXT, length REAL, breadth REAL);
CREATE TABLE event(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL,
  reg_no TEXT, name TEXT, queue TEXT, zone TEXT,
  old_value TEXT, new_value TEXT);
CREATE TABLE movement(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, name TEXT, quay TEXT,
  zone_order INTEGER, berthing_date TEXT, expected_departure TEXT,
  berthed_by TEXT);
CREATE TABLE polls(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, endpoint TEXT NOT NULL,
  ok INTEGER NOT NULL, http_status INTEGER, ms INTEGER, hash TEXT,
  changed INTEGER, error TEXT);
CREATE TABLE queue_listing(
  raw_id INTEGER NOT NULL, ts TEXT NOT NULL, queue TEXT NOT NULL,
  position INTEGER NOT NULL, reg_no TEXT, name TEXT, status TEXT,
  given_zone TEXT, given_position TEXT, held_at TEXT,
  length REAL, breadth REAL);
```

Rebuild a SQLite database from these files:

```bash
python3 weather/import_export.py collector/export rebuilt.sqlite
```
