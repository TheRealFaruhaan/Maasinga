import json, sys, os, csv

SRC, OUT, ISLANDS_CSV = sys.argv[1], sys.argv[2], sys.argv[3]
TOL_LAND = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0001
TOL_REEF = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0002


def load(name):
    return json.load(open(os.path.join(SRC, name)))['elements']


def pts(geom):
    return [(p['lon'], p['lat']) for p in geom if p]


def stitch(segs):
    """Join open line segments into closed rings by shared end points."""
    segs = [list(s) for s in segs if len(s) >= 2]
    rings = []
    while segs:
        cur = segs.pop()
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s + cur[1:]
                elif s[0] == cur[0]:
                    cur = s[::-1] + cur[1:]
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


def area2(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))


def inside(pt, ring):
    x, y = pt
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def bbox(r):
    xs = [p[0] for p in r]
    ys = [p[1] for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def dp(p, tol):
    if len(p) < 3:
        return p
    keep = [False] * len(p)
    keep[0] = keep[-1] = True
    stack = [(0, len(p) - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = p[a]
        bx, by = p[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = p[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > t2:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [q for q, k in zip(p, keep) if k]


def rnd(r, nd):
    out = []
    for x, y in r:
        q = [round(x, nd), round(y, nd)]
        if not out or out[-1] != q:
            out.append(q)
    return out


def simp_ring(r, tol, keep_small):
    """Simplify a closed ring. Closed ring: split at the farthest point so DP keeps shape."""
    r = r[:-1] if r[0] == r[-1] else r
    if len(r) < 3:
        return None
    far = max(range(len(r)), key=lambda i: (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2)
    s = dp(r[:far + 1], tol)[:-1] + dp(r[far:] + [r[0]], tol)
    s = rnd(s, 5)
    if len(s) < 4 or abs(area2(s)) == 0:
        if not keep_small:
            return None
        s = rnd(r + [r[0]], 5)
        if len(s) > 4:
            n = len(s) - 1
            s = [s[0], s[n // 3], s[2 * n // 3], s[0]]
        if len(s) < 4:
            return None
    if s[0] != s[-1]:
        s.append(s[0])
    return s


def polygons_from(elements):
    """Return list of (outer, [inners], tags) for closed ways and multipolygon relations."""
    out = []
    for e in elements:
        tags = e.get('tags', {})
        if e['type'] == 'way':
            r = pts(e.get('geometry', []))
            if len(r) >= 4 and r[0] == r[-1]:
                out.append((r, [], tags))
        elif e['type'] == 'relation':
            outers = stitch([pts(m.get('geometry', [])) for m in e['members'] if m['type'] == 'way' and m['role'] in ('outer', '')])
            inners = stitch([pts(m.get('geometry', [])) for m in e['members'] if m['type'] == 'way' and m['role'] == 'inner'])
            obox = [bbox(o) for o in outers]
            groups = [[] for _ in outers]
            for inn in inners:
                p = inn[0]
                for k, o in enumerate(outers):
                    b = obox[k]
                    if b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3] and inside(p, o):
                        groups[k].append(inn)
                        break
            for o, g in zip(outers, groups):
                out.append((o, g, tags))
    return out


def feature(polys, props, tol, keep_small):
    """polys: list of (outer, inners). Returns GeoJSON feature or None."""
    rings_out = []
    for o, inners in polys:
        so = simp_ring(o, tol, keep_small)
        if not so:
            continue
        if area2(so) < 0:
            so = so[::-1]
        rs = [so]
        for i in inners:
            si = simp_ring(i, tol, False)
            if si:
                if area2(si) > 0:
                    si = si[::-1]
                rs.append(si)
        rings_out.append(rs)
    if not rings_out:
        return None
    if len(rings_out) == 1:
        g = {'type': 'Polygon', 'coordinates': rings_out[0]}
    else:
        g = {'type': 'MultiPolygon', 'coordinates': rings_out}
    return {'type': 'Feature', 'properties': props, 'geometry': g}


def dump(obj, path):
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    return os.path.getsize(path)


# ---------- land ----------
isl = polygons_from(load('osm1.json'))
isl_boxes = [bbox(o) for o, _, _ in isl]


def in_island(p):
    for k, (o, _, _) in enumerate(isl):
        b = isl_boxes[k]
        if b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3] and inside(p, o):
            return k
    return None


coast = load('osm4.json')
closed = [pts(e['geometry']) for e in coast if e['nodes'][0] == e['nodes'][-1]]
openw = [pts(e['geometry']) for e in coast if e['nodes'][0] != e['nodes'][-1]]
coast_rings = closed + stitch(openw)
extra = 0
dropped = []
land_polys = [((o, inn), t.get('name:en') or t.get('name')) for o, inn, t in isl]
for r in coast_rings:
    if area2(r) < 0:  # clockwise coastline ring = water inside land, skip
        continue
    # skip rings already covered by an island polygon (test a vertex and the mean point)
    mx = sum(p[0] for p in r[:-1]) / (len(r) - 1)
    my = sum(p[1] for p in r[:-1]) / (len(r) - 1)
    if in_island((mx, my)) is not None or in_island(r[0]) is not None:
        continue
    # skip coarse rings that enclose island polygons (old outlines drawn around a whole reef)
    rb = bbox(r)
    if any(rb[0] <= o[0][0] <= rb[2] and rb[1] <= o[0][1] <= rb[3] and inside(o[0], r) for o, _, _ in isl):
        dropped.append(r)
        continue
    land_polys.append(((r, []), None))
    extra += 1

land = []
for (o, inn), name in land_polys:
    f = feature([(o, inn)], {'name': name} if name else {}, TOL_LAND, True)
    if f:
        land.append(f)
fc_land = {'type': 'FeatureCollection', 'features': land}
s1 = dump(fc_land, os.path.join(OUT, 'land.json'))
allc = [c for f in land for poly in ([f['geometry']['coordinates']] if f['geometry']['type'] == 'Polygon' else f['geometry']['coordinates']) for c in poly[0]]
print('land features', len(land), 'from islands', len(isl), 'coast-only rings', extra, 'dropped enclosing rings', len(dropped), [(round(r[0][1], 3), round(r[0][0], 3)) for r in dropped], 'size', s1,
      'bbox lon', min(c[0] for c in allc), max(c[0] for c in allc), 'lat', min(c[1] for c in allc), max(c[1] for c in allc))

# ---------- reefs ----------
reef_polys = polygons_from(load('osm2.json'))
reefs = []
for o, inn, t in reef_polys:
    f = feature([(o, inn)], {}, TOL_REEF, True)
    if f:
        reefs.append(f)
s2 = dump({'type': 'FeatureCollection', 'features': reefs}, os.path.join(OUT, 'reefs.json'))
print('reef features', len(reefs), 'of', len(reef_polys), 'size', s2)

# ---------- resorts ----------
inhabited = []
with open(ISLANDS_CSV) as f:
    for row in csv.DictReader(f):
        inhabited.append((float(row['lon']), float(row['lat'])))
inhab_islands = set()
for p in inhabited:
    k = in_island(p)
    if k is not None:
        inhab_islands.add(k)


def center(e):
    if 'center' in e:
        return e['center']['lon'], e['center']['lat']
    return e['lon'], e['lat']


res = {}  # key: island index or element id
order = []


def add(key, name, lon, lat, prio):
    if key in res and res[key][0] >= prio:
        return
    if key not in res:
        order.append(key)
    res[key] = (prio, name, lat, lon)


for e in load('osm5.json'):  # leisure=resort
    t = e['tags']
    name = t.get('name:en') or t.get('name')
    if not name:
        continue
    lon, lat = center(e)
    k = in_island((lon, lat))
    add(('i', k) if k is not None else ('e', e['id']), name, lon, lat, 3)
for e in load('osm3.json'):  # tourism=resort / tourism=hotel
    t = e['tags']
    name = t.get('name:en') or t.get('name')
    if not name:
        continue
    lon, lat = center(e)
    k = in_island((lon, lat))
    if t.get('tourism') == 'resort':
        add(('i', k) if k is not None else ('e', e['id']), name, lon, lat, 3)
    elif k is not None and k not in inhab_islands:
        add(('i', k), name, lon, lat, 2)
# island polygons tagged as resorts (leisure/tourism/resort, or website/phone on uninhabited island)
for k, (o, _, t) in enumerate(isl):
    if k in inhab_islands or not t.get('name'):
        continue
    if t.get('leisure') in ('resort', 'beach_resort') or t.get('tourism') in ('resort', 'hotel') or t.get('website') or t.get('phone') or t.get('email'):
        b = isl_boxes[k]
        add(('i', k), t.get('name:en') or t['name'], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 1)

resorts = [[res[k][1], round(res[k][2], 4), round(res[k][3], 4)] for k in order]
resorts.sort(key=lambda r: (-r[1], r[2]))
s3 = dump(resorts, os.path.join(OUT, 'resorts.json'))
print('resorts', len(resorts), 'size', s3, 'inhabited islands matched', len(inhab_islands))
