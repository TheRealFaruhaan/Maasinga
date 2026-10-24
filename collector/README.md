# Port queue collector

Polls the public `local.port.mv` portal API every 2 minutes and records queue
positions and berth occupancy in `data/port.sqlite`, since the portal keeps no history.

- `/api/portal/vessel-queue`: queue A / B Express / C / D listings (order = position)
- `/api/portal/vessels-berthed`: vessels per zone
- `/api/portal/mnh-movements`: per-vessel BerthingDate (entered current zone), ExpectedDeparture

Runs as the Crundi service `port-collector`:
`python3 collector/collect.py --interval 120`

Tables: `polls` (coverage), `raw` (gzipped JSON when changed), `queue_listing`,
`berth`, `movement`, `event` (queue_join/leave/move, status_change, given_change,
zone_enter/leave). Our timestamps are UTC; portal timestamps are Maldives time (UTC+5).

```sql
-- queue history of one vessel
SELECT ts, queue, position, status FROM queue_listing WHERE name LIKE 'MAAZ%' ORDER BY ts;
-- recent events
SELECT * FROM event ORDER BY id DESC LIMIT 50;
```
