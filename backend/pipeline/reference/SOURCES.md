# Sources for islands.csv

## URLs
- Census 2022 index page (MBS): https://statisticsmaldives.gov.mv/census-2022/
- Population by island, Census 2022, Table P3 (final, used for all population values): https://statisticsmaldives.gov.mv/mbs/wp-content/uploads/2023/07/P3.xlsx
- Cross-check, Island Level Indicator Sheet (admin island total 236,911 matches P3): https://statisticsmaldives.gov.mv/mbs/wp-content/uploads/2023/09/Island-Level-Indicator-Sheet-Population.xlsx
- Cross-check, Table P1 national totals (515,132 residents): https://statisticsmaldives.gov.mv/mbs/wp-content/uploads/2023/07/P1.xlsx
- Coordinates, OpenStreetMap via Overpass API, bbox (-1,72,8,74.5): natural=coastline ways, place=island/islet ways and relations (out geom), place nodes; plus way 31786895 (Feydhoo), relation 16809671 (Maradhoo), node 4016221950 (Maradhoofeydhoo): https://overpass-api.de/api/interpreter
- Name and atoll matching aid only (no coordinates used), Wikidata SPARQL (items with P17=Q826 and P625, plus P131 for atoll): https://query.wikidata.org/sparql

## Caveats
- population_2022 is total resident population (Maldivians + foreigners) at place of enumeration, from final Table P3 (July 2023), not the provisional March 2023 tables.
- Rows cover 186 administrative (inhabited) islands plus 4 Male City areas. Sum is 447,420.
- Not in the file: resorts (52,482), industrial islands (13,831; P3 gives only a total, so Thilafushi and Gulhifalhu have no row), Male harbours/boats (1,399). These bring the total to 515,132.
- Male = sum of wards Henveiru, Galolhu, Machchangolhi, Maafannu (137,238).
- Hulhumale = Phase 1 (35,859) + Phase 2 (29,855); one coordinate (OSM Hulhumale multipolygon).
- coord_source: osm_polygon (189 rows) = area centroid of the name-matched OSM island polygon, or a point inside the polygon if the centroid falls outside it; osm_node (1 row) = OSM place node. No row uses Wikidata coordinates.
- Wikidata P625 points were dropped because of degree-minute rounding (up to about 5 km off, e.g. B.Eydhafushi, B.Fehendhoo, HDh.Nolhivaranfaru). Where the OSM polygon has a wikidata tag, the match uses that tag.
- Check: all 190 points lie inside an OSM island polygon (distance 0 m).
- S. Feydhoo and S. Maradhoo use OSM natural=sand polygons named Feydhoo and Maradhoo (the reclaimed Addu link islands have no named coastline polygon). S. Maradhoo-Feydhoo uses the OSM place=locality node Maradhoofeydhoo (osm_node).
- Atoll is assigned by name match plus distance to atoll median point (within 70 km), with OSM is_in:archipelago or Wikidata P131 as a hint for duplicate names.
- 23 islands matched by fuzzy name because the census drops nasal "n" (e.g. Kuribi = Kurinbi, Dhagethi = Dhangethi, Viligili = Villingili, Fiyoari = Fiyoaree).
- L. Gamu is matched to Gan (Laamu), the island where Gamu is located.
- S. Hulhudhoo and S. Meedhoo are two census localities on one island (Hulhumeedhoo); both rows have the same point (OSM Hulhumeedhoo polygon).
- island_code uses atoll letter code + census island name (e.g. K.Maafushi); Male City rows use prefix MLE.
- Island names keep MBS Census spelling, except Male City areas (Male, Hulhumale, Vilimale, Hulhule).
- OSM data is under ODbL; Wikidata is CC0. Retrieved 2026-10-24.

## Basemap
Files: data/out/land.json, reefs.json, resorts.json. Source: OpenStreetMap via Overpass API (https://overpass-api.de/api/interpreter), bbox (-1,72,8,74.5), retrieved 2026-10-24. Licence: OpenStreetMap contributors, ODbL.
- Land, islands: `(way["place"~"^(island|islet)$"](bbox); relation["place"~"^(island|islet)$"](bbox);); out geom;`
- Land, coastline: `way["natural"="coastline"](bbox); out geom;` (closed or stitched counterclockwise rings not already covered by an island polygon; 3 coarse rings that enclose whole reefs dropped)
- Reefs: `(way["natural"="reef"](bbox); relation["natural"="reef"](bbox);); out geom;`
- Resorts, hotels: `(nwr["tourism"="resort"](bbox); nwr["tourism"="hotel"](bbox);); out center tags;` (no tourism=resort in OSM here; hotels kept only on islands with no inhabited-island point from islands.csv)
- Resorts, leisure: `nwr["leisure"="resort"](bbox); out center tags;` (plus uninhabited named island polygons tagged leisure/tourism resort or with website/phone/email)
- Processing: Douglas-Peucker simplify (land 0.00005 deg, reefs 0.0002 deg), small rings kept, coordinates 5 decimals (resorts 4). Land "name" is name:en, else name.

## Weather
Files: pipeline/reference/weather/<region>.json, built by pipeline/02_weather.py from the team weather export (weather/export at the repo root; method in weather/DATA_GUIDE.md).
- Wind gusts: ERA5 reanalysis via Open-Meteo (era5_hourly), m/s converted to knots. Licence CC BY 4.0.
- Waves: ERA5-Ocean via Open-Meteo Marine (marine_hourly, model era5_ocean). Licence CC BY 4.0.
- Rain: NASA GPM IMERG daily, 0.1 degree cells (imerg_daily). NASA open data.
- Per region: worst value each hour over the sea points (role line or side) in the region's latitude band; rain is the mean over IMERG cells in the band, lon 72.6 to 73.8. Times converted from UTC to UTC+5.
