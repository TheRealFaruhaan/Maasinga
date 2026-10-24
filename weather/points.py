"""Sample points for gridded weather down the Maldives chain.

Line: every 0.5 deg of latitude from 7.0N to 0.75S, following the chain's
longitude (snapped to the ERA5 0.25 deg grid).
Side: one point west and one east of the wider atolls / double-row sections.
Station: the five NOAA GSOD stations, for checking gridded values against
observations.
"""

# id, name, lat, lon, region, role
POINTS = [
    ("L01", "Haa Alif", 7.00, 73.00, "north", "line"),
    ("L02", "Haa Dhaalu", 6.50, 73.00, "north", "line"),
    ("L03", "Shaviyani / Noonu", 6.00, 73.25, "north", "line"),
    ("L04", "Raa / Lhaviyani", 5.50, 73.25, "north", "line"),
    ("L05", "Baa / Kaafu north", 5.00, 73.25, "central", "line"),
    ("L06", "North Male", 4.50, 73.50, "central", "line"),
    ("L07", "South Male / Ari", 4.00, 73.25, "central", "line"),
    ("L08", "Ari south / Vaavu", 3.50, 73.25, "central", "line"),
    ("L09", "Faafu / Meemu", 3.00, 73.25, "central", "line"),
    ("L10", "Dhaalu / Thaa", 2.50, 73.25, "central", "line"),
    ("L11", "Laamu", 2.00, 73.50, "south", "line"),
    ("L12", "One and Half Degree Channel", 1.50, 73.25, "south", "line"),
    ("L13", "Huvadhoo north", 1.00, 73.25, "south", "line"),
    ("L14", "Huvadhoo centre", 0.50, 73.25, "south", "line"),
    ("L15", "Equatorial Channel", 0.00, 73.25, "south", "line"),
    ("L16", "Fuvahmulah", -0.25, 73.50, "south", "line"),
    ("L17", "Addu", -0.75, 73.25, "south", "line"),
    ("W01", "West of Haa Alif", 6.75, 72.75, "north", "side"),
    ("E01", "East of Haa Dhaalu / Shaviyani", 6.50, 73.50, "north", "side"),
    ("W02", "West of Raa", 5.50, 72.75, "north", "side"),
    ("E02", "East of Lhaviyani", 5.25, 73.75, "north", "side"),
    ("W03", "West of Ari", 3.75, 72.50, "central", "side"),
    ("E03", "East of Male", 4.25, 73.75, "central", "side"),
    ("W04", "West of Faafu / Dhaalu", 2.75, 72.75, "central", "side"),
    ("E04", "East of Meemu", 2.75, 73.75, "central", "side"),
    ("W05", "West of Huvadhoo", 0.50, 72.75, "south", "side"),
    ("E05", "East of Huvadhoo", 0.50, 73.75, "south", "side"),
    ("S435330", "Hanimaadhoo (GSOD)", 6.733, 73.167, "north", "station"),
    ("S435550", "Hulhule / Velana (GSOD)", 4.192, 73.529, "central", "station"),
    ("S435770", "Kadhdhoo (GSOD)", 1.883, 73.500, "south", "station"),
    ("S435880", "Kaadedhdhoo (GSOD)", 0.483, 72.983, "south", "station"),
    ("S435990", "Gan (GSOD)", -0.693, 73.156, "south", "station"),
]

GSOD_STATIONS = {
    "43533099999": "S435330",
    "43555099999": "S435550",
    "43577099999": "S435770",
    "43588099999": "S435880",
    "43599099999": "S435990",
}

# Box around the whole chain, for gridded products fetched as boxes (OISST, IMERG)
BOX = dict(lat_min=-1.0, lat_max=7.5, lon_min=72.25, lon_max=74.0)
