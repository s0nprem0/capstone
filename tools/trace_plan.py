#!/usr/bin/env python3
"""Rebuild every plot on the map from the scanned survey plan.

The plan (public/traces/survey-lines.png, 4096x3072) is the map's coordinate
space. Each plot on it is a patch of paper enclosed by drawn lines, so the
plots are found as the enclosed regions of a line mask, upright or rotated.
They are then grouped into the plan's blocks (the areas between walks), rows
are recovered within each block, gaps a faint or smudged line left are filled
and merged pairs split, and every row is given to the circled section number
the plan prints for it.

    python3 tools/trace_plan.py report            # counts per block and section
    python3 tools/trace_plan.py preview out.png   # every plot, coloured by section
    python3 tools/trace_plan.py sql               # writes database/survey/lots.sql

Needs numpy and opencv, e.g.
    nix shell --impure --expr '(builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux.python3.withPackages (ps: [ps.numpy ps.opencv4])'

Block outlines below were read off the plan by eye. They only have to fall in
the walks between blocks, so they are generous rather than exact.
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / 'public/traces/survey-lines.png'
CENTRES = ROOT / 'database/survey/section-centres.json'
OUT_SQL = ROOT / 'database/survey/lots.sql'

# Outlines were read off a 2000px-wide view of the plan; this puts them on the
# 4096px sheet.
S = 4096 / 2000


def sheet(points):
    return [(round(x * S), round(y * S)) for x, y in points]


def box(x0, y0, x1, y1):
    return sheet([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


# The drawn site. Anything outside it (title block, location inset, margins)
# is never a plot. Its edges double as the lines the perimeter rows follow.
SITE = sheet([(212, 120), (1000, 98), (1142, 101), (1477, 146), (1532, 385), (1834, 940),
              (1380, 1502), (652, 1128), (642, 1196), (146, 1132), (188, 388)])

# Circles the centres file lacks: the two perimeter sections.
EXTRA_CENTRES = {1: (379.0, 1587.0), 2: (3107.0, 2638.0)}

# Blocks: name, outline, how rows map to sections.
#   rows    - rows top to bottom, shared out between the circled numbers in the
#             block, `per` rows each, in order (the plan circles a section's
#             number in its first row).
#   columns - columns left to right, each going to the nearest circle by x.
#   single  - the whole block is one section.
BLOCKS = [
    {'name': 'north-a', 'outline': sheet([(545, 135), (1000, 106), (1145, 106), (1478, 148), (1490, 218), (545, 210)]),
     'mode': 'single', 'section': 69, 'code': 'NA'},
    {'name': 'north-b', 'outline': sheet([(595, 208), (1502, 224), (1534, 390), (766, 382)]),
     'mode': 'single', 'section': 70, 'code': 'NB'},
    {'name': 'west', 'outline': box(236, 410, 521, 793), 'mode': 'rows', 'sections': list(range(3, 12))},
    {'name': 'west-2', 'outline': box(523, 410, 818, 793), 'mode': 'rows', 'sections': list(range(12, 21))},
    {'name': 'chapel', 'outline': box(819, 612, 992, 793), 'mode': 'columns', 'sections': [21, 22, 23, 24]},
    {'name': 'crypts', 'outline': box(226, 794, 613, 1114), 'mode': 'rows', 'sections': list(range(25, 32))},
    {'name': 'crypts-2', 'outline': box(614, 794, 992, 1242), 'mode': 'rows', 'sections': list(range(32, 42))},
    {'name': 'east', 'outline': sheet([(940, 418), (1514, 420), (1602, 664), (985, 664)]),
     'mode': 'rows', 'sections': list(range(42, 48))},
    {'name': 'east-2', 'outline': box(999, 665, 1338, 990), 'mode': 'rows', 'sections': list(range(48, 56))},
    {'name': 'east-3', 'outline': sheet([(1339, 665), (1578, 665), (1722, 945), (1722, 990), (1339, 990)]),
     'mode': 'rows', 'sections': list(range(56, 64))},
    {'name': 'south', 'outline': box(999, 991, 1722, 1102), 'mode': 'single', 'section': 65},
    {'name': 'south-2', 'outline': box(999, 1103, 1612, 1207), 'mode': 'single', 'section': 66, 'regular': False},
    {'name': 'south-3', 'outline': box(999, 1208, 1548, 1306), 'mode': 'single', 'section': 67, 'regular': False},
    {'name': 'south-4', 'outline': box(1150, 1307, 1465, 1405), 'mode': 'single', 'section': 68, 'regular': False},
]

# The perimeter rows run along the site's edges, so each is defined by the
# stretch of edge it follows, walked in the order its plots are numbered.
# Section 64 is the inner row along the east walk; its path is the row's own
# centre line, read off the plan, since it follows no edge of the site.
PERIMETER = [
    {'section': 1, 'path': SITE[10:11] + SITE[9:10] + SITE[8:9] + SITE[7:8] + SITE[6:7], 'band': (0, 120)},
    {'section': 2, 'path': SITE[4:7], 'band': (0, 120)},
    {'section': 64, 'path': sheet([(1583, 672), (1733, 938)]), 'band': (0, 75)},
]

PERIMETER_SECTIONS = {p['section'] for p in PERIMETER}

SECTION_NAMES = {69: 'North Strip A', 70: 'North Strip B'}
SECTION_NOTES = {
    1: 'Perimeter row along the west and south walls',
    2: 'Perimeter row along the east wall',
    64: 'Inner row along the east walk',
    69: 'Northern strip by the 8.00 m road; not numbered on the survey plan',
    70: 'Second northern strip; not numbered on the survey plan',
}

PRICE = 45000.00
# The most plots a gap in a row is filled with.
MAX_FILL = 4
# A drawn line's width: what separates a plot put back by the trace from its
# neighbours, as the line it stands in for would have.
LINE = 2.0
# Degrees off square within which a plot counts as upright.
UPRIGHT = 4
# A plot this many times the size of a standard one is sold as a double or a
# family plot. Standard is the median plot on the plan.
DOUBLE_AT, FAMILY_AT = 1.7, 3.2


def line_mask(gray):
    # Darker than the local paper. Adaptive, because the photograph is unevenly
    # lit; the window spans a few plots.
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12)


def find_cells(gray):
    site = np.zeros_like(gray)
    cv2.fillPoly(site, [np.array(SITE, np.int32)], 255)
    paper = cv2.bitwise_and(cv2.bitwise_not(line_mask(gray)), site)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(paper, connectivity=4)
    cells = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 120 or area > 16000 or w < 5 or h < 5:
            continue
        comp = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        contours, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        contour = max(contours, key=cv2.contourArea)
        # A digit or a pencil box inside a plot is a hole, not a wall.
        filled = np.zeros_like(comp)
        cv2.drawContours(filled, [contour], -1, 1, -1)
        filled_px = int(filled.sum())
        (cx, cy), (rw, rh), ang = cv2.minAreaRect((contour + (x, y)).astype(np.float32))
        # The contour runs through the region's edge pixels, so the region is a
        # pixel larger; measured on the contour, the stored plot sits just inside
        # its drawn lines and never reaches a neighbour across one.
        if min(rw, rh) < 1 or max(rw, rh) / min(rw, rh) > 10:
            continue
        if filled_px / ((rw + 1) * (rh + 1)) >= 0.75:
            cell = make_cell(cx, cy, rw, rh, ang, filled_px) | {'traced': True}
            if not is_upright(cell):
                # A tilted plot is kept as traced: a rectangle fitted to it
                # bulges past its corners into the next plot.
                cell['quad'] = (cv2.approxPolyDP(contour, 1.5, True).reshape(-1, 2) + (x, y)).astype(float).tolist()
            cells.append(cell)
            continue
        # The plots cut by a diagonal walk are trapezoids and triangles, which no
        # rectangle fits. A large, convex region is still a plot: keep its outline.
        hull_area = cv2.contourArea(cv2.convexHull(contour)) or 1
        if filled_px >= 1500 and cv2.contourArea(contour) / hull_area >= 0.9:
            outline = cv2.approxPolyDP(contour, 2.5, True).reshape(-1, 2) + (x, y)
            cells.append(make_polygon(outline, filled_px) | {'traced': True})
    return drop_nested(cells)


def make_polygon(outline, area):
    xs, ys = outline[:, 0].astype(float), outline[:, 1].astype(float)
    m = cv2.moments(outline.astype(np.float32))
    return {'cx': m['m10'] / m['m00'], 'cy': m['m01'] / m['m00'], 'w': xs.max() - xs.min(), 'h': ys.max() - ys.min(),
            'angle': 0.0, 'area': float(area), 'quad': outline.astype(float).tolist(), 'polygon': True,
            'bbox': [xs.min(), ys.min(), xs.max(), ys.max()]}


def make_cell(cx, cy, w, h, angle, area=None):
    # Normalise so the angle is in [-45, 45) and `w` runs along the cell's own
    # x axis: upright cells then read as angle ~0 with `w` horizontal, whatever
    # convention minAreaRect picked. A quarter turn swaps the sides.
    turned = ((angle + 45) % 90) - 45
    if round((angle - turned) / 90) % 2:
        w, h = h, w
    # Nearly upright is upright: the map stores these as plain rectangles, and
    # the bounding box of a plot tilted two degrees is wider than the plot,
    # enough to overlap its neighbours.
    angle = 0.0 if abs(turned) < UPRIGHT else turned
    quad = cv2.boxPoints(((cx, cy), (w, h), angle))
    xs, ys = quad[:, 0], quad[:, 1]
    return {'cx': float(cx), 'cy': float(cy), 'w': float(w), 'h': float(h), 'angle': float(angle),
            'area': float(area if area is not None else w * h), 'quad': quad.tolist(),
            'bbox': [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]}


def drop_overlaps(cells):
    """Two plots on one patch of ground: a plot put back where the trace did in
    fact find one, slightly off, or a sliver a pencil digit cut from a plot.
    Traced plots win over ones put back, and a whole plot over a sliver."""
    cells = sorted(cells, key=lambda c: (not c.get('traced'), -c['area']))
    grid, kept = {}, []
    for c in cells:
        shape = np.array(c['quad'], np.float32)
        key = (int(c['cx'] // 100), int(c['cy'] // 100))
        nearby = [o for dx in (-1, 0, 1) for dy in (-1, 0, 1) for o in grid.get((key[0] + dx, key[1] + dy), [])]
        clash = False
        for o in nearby:
            area, _ = cv2.intersectConvexConvex(cv2.convexHull(shape), cv2.convexHull(np.array(o['quad'], np.float32)))
            if area <= 2:
                continue
            clash = True
            break
        if not clash:
            kept.append(c)
            grid.setdefault(key, []).append(c)
    return kept


def drop_nested(cells):
    """A pencil box drawn inside a plot is found as a cell of its own; the plot wins."""
    cells = sorted(cells, key=lambda c: -c['area'])
    grid, kept = {}, []
    for c in cells:
        key = (int(c['cx'] // 100), int(c['cy'] // 100))
        nearby = [o for dx in (-1, 0, 1) for dy in (-1, 0, 1) for o in grid.get((key[0] + dx, key[1] + dy), [])]
        if any(o['area'] > 1.5 * c['area']
               and cv2.pointPolygonTest(np.array(o['quad'], np.float32), (c['cx'], c['cy']), False) >= 0
               for o in nearby):
            continue
        kept.append(c)
        grid.setdefault(key, []).append(c)
    return kept


def inside(poly, x, y):
    return cv2.pointPolygonTest(np.array(poly, np.float32), (x, y), False) >= 0


def is_upright(c):
    """Block plots are upright rectangles, or the irregular plots at a block's cut edge."""
    return c.get("polygon", False) or abs(c["angle"]) < UPRIGHT


def distance_along(path, x, y):
    """Distance from the polyline, how far along it the closest point is, and on which stretch."""
    best, walked, best_at, best_seg = math.inf, 0.0, 0.0, 0
    for seg, ((ax, ay), (bx, by)) in enumerate(zip(path, path[1:])):
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (length * length)))
        d = math.hypot(x - (ax + t * dx), y - (ay + t * dy))
        if d < best:
            best, best_at, best_seg = d, walked + t * length, seg
        walked += length
    return best, best_at, best_seg


def cluster(values, gap):
    """Split sorted values into runs wherever the step exceeds `gap`."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    groups, current = [], [order[0]]
    for a, b in zip(order, order[1:]):
        if values[b] - values[a] > gap:
            groups.append(current)
            current = []
        current.append(b)
    groups.append(current)
    return groups


def merge_slivers(row, width):
    """A pencil stroke inside a plot splits it into slivers the trace reads as
    plots of their own. Neighbours that are each too narrow to be a plot and
    together span about one are one plot."""
    out = []
    for c in row:
        if out:
            a = out[-1]
            left, right = a['cx'] - a['w'] / 2, c['cx'] + c['w'] / 2
            narrow = min(a['w'], c['w']) < 0.7 * width
            if narrow and abs((right - left) - width) < 0.3 * width:
                top = min(a['cy'] - a['h'] / 2, c['cy'] - c['h'] / 2)
                bottom = max(a['cy'] + a['h'] / 2, c['cy'] + c['h'] / 2)
                merged = make_cell((left + right) / 2, (top + bottom) / 2, right - left, bottom - top, 0, a['area'] + c['area'])
                out[-1] = merged | {'traced': a.get('traced', False) or c.get('traced', False)}
                continue
        out.append(c)
    return out


def regularise_row(row):
    """Within one row: split cells a missing line merged, fill gaps a broken line opened."""
    row = sorted(row, key=lambda c: c['cx'])
    width = float(np.median([c['w'] for c in row]))
    height = float(np.median([c['h'] for c in row]))
    row = merge_slivers(row, width)
    out = []
    for c in row:
        k = round(c['w'] / width)
        if k >= 2 and abs(c['w'] / k - width) < 0.3 * width:
            left = c['cx'] - c['w'] / 2
            for j in range(k):
                out.append(make_cell(left + (j + 0.5) * c['w'] / k, c['cy'], c['w'] / k - LINE, c['h'], 0))
        else:
            out.append(c)
    filled = [out[0]]
    for a, b in zip(out, out[1:]):
        gap = (b['cx'] - b['w'] / 2) - (a['cx'] + a['w'] / 2)
        k = round(gap / width)
        # Up to a few plots: a wider gap is a path or the row's end, not a smudge.
        if 1 <= k <= MAX_FILL and abs(gap / k - width) < 0.35 * width:
            left = a['cx'] + a['w'] / 2
            for j in range(k):
                filled.append(make_cell(left + (j + 0.5) * gap / k, (a['cy'] + b['cy']) / 2, gap / k - LINE, height, 0))
        filled.append(b)
    return filled


def split_tall(cells, height):
    """A missing horizontal line leaves one cell spanning two rows; cut it back."""
    out = []
    for c in cells:
        k = round(c['h'] / height)
        if k >= 2 and abs(c['h'] / k - height) < 0.25 * height:
            top = c['cy'] - c['h'] / 2
            out += [make_cell(c['cx'], top + (j + 0.5) * c['h'] / k, c['w'], c['h'] / k - LINE, 0) for j in range(k)]
        else:
            out.append(c)
    return out


def fill_strip(strip):
    """Perimeter plots are evenly spaced along their row; put back any the trace missed.

    A missing plot is drawn as a copy of the one before it, slid along the
    line to the next, so it keeps the row's own tilt and depth.
    """
    if len(strip) < 3:
        return strip
    # A pencil box drawn inside a perimeter plot can be all the trace finds of it.
    # Far smaller than its row, it stands for a missing plot, not a plot.
    typical = float(np.median([c["area"] for c in strip]))
    strip = [c for c in strip if c["area"] >= 0.45 * typical]
    steps = [b['along'] - a['along'] for a, b in zip(strip, strip[1:])]
    spacing = float(np.median(steps))
    out = [strip[0]]
    for a, b, step in zip(strip, strip[1:], steps):
        k = round(step / spacing) - 1
        # Only along one straight stretch: across a corner the row turns, and a
        # copy slid between the two ends would sit in the walk.
        if a['seg'] == b['seg'] and 1 <= k <= MAX_FILL and abs(step / (k + 1) - spacing) < 0.35 * spacing:
            for j in range(1, k + 1):
                t = j / (k + 1)
                dx, dy = (b['cx'] - a['cx']) * t, (b['cy'] - a['cy']) * t
                c = make_cell(a['cx'] + dx, a['cy'] + dy, a['w'], a['h'], a['angle'])
                c['quad'] = [[px + dx, py + dy] for px, py in a['quad']]
                c['along'], c['seg'] = a['along'] + step * t, a['seg']
                out.append(c)
        out.append(b)
    return out


def split_rows(row, height):
    """Two rows can chain into one cluster through a stray cell; cut at the widest gap."""
    ys = sorted(c['ry'] for c in row)
    if len(ys) < 2 or ys[-1] - ys[0] <= 0.7 * height:
        return [row]
    gaps = [(b - a, (a + b) / 2) for a, b in zip(ys, ys[1:])]
    _, cut = max(gaps)
    above = [c for c in row if c['ry'] < cut]
    below = [c for c in row if c['ry'] >= cut]
    return split_rows(above, height) + split_rows(below, height)


def row_slope(cells):
    """How far the block's rows drop per unit across, found as the tilt that
    stacks the plots' centres into the sharpest rows. Several blocks were drawn
    a degree or two off square, enough over a block's width to merge rows."""
    xs = np.array([c['cx'] for c in cells])
    ys = np.array([c['cy'] for c in cells])
    def sharpness(s):
        counts = np.bincount(((ys - s * xs) - (ys - s * xs).min()).astype(int) // 4)
        return float((counts.astype(float) ** 2).sum())
    return max(np.linspace(-0.05, 0.05, 201), key=sharpness)


def fill_columns(rows, slope):
    """Put back plots a row is missing where the rows either side have one.

    A block's plots line up in columns, so a gap in a row with a plot above it
    and below it at the same place is a plot the trace missed: a circled
    number or a digit drawn over it, more often than a smudged line. Only
    inside the row's own extent, so a block's stepped edge is left as drawn.
    """
    def overlaps(c, x0, x1):
        return min(c['cx'] + c['w'] / 2, x1) - max(c['cx'] - c['w'] / 2, x0) > 0.3 * (x1 - x0)

    out = []
    for i, row in enumerate(rows):
        left = min(c['cx'] - c['w'] / 2 for c in row)
        right = max(c['cx'] + c['w'] / 2 for c in row)
        ry = float(np.median([c['cy'] - slope * c['cx'] for c in row]))
        height = float(np.median([c['h'] for c in row]))
        above = rows[i - 1] if i > 0 else []
        below = rows[i + 1] if i + 1 < len(rows) else []
        added = list(row)
        for n in above:
            x0, x1 = n['cx'] - n['w'] / 2, n['cx'] + n['w'] / 2
            if x0 < left - 0.2 * n['w'] or x1 > right + 0.2 * n['w']:
                continue
            if any(overlaps(c, x0, x1) for c in added):
                continue
            if not any(overlaps(m, x0, x1) for m in below):
                continue
            added.append(make_cell(n['cx'], ry + slope * n['cx'], n['w'], height, 0))
        out.append(sorted(added, key=lambda c: c['cx']))
    return out


def rows_of(cells):
    height = float(np.median([c['h'] for c in cells]))
    cells = split_tall(cells, height)
    slope = row_slope(cells)
    for c in cells:
        c['ry'] = c['cy'] - slope * c['cx']
    groups = cluster([c['ry'] for c in cells], 0.45 * height)
    rows = [r for g in groups for r in split_rows([cells[i] for i in g], height)]
    # A sliver of a row is where a walk's edge line wobbles, not plots.
    rows = [r for r in rows if np.median([c['h'] for c in r]) >= 0.6 * height]
    rows = [r for r in rows if len(r) >= 2 or r[0]['area'] > 0.6 * height * height]
    rows = [regularise_row(r) for r in sorted(rows, key=lambda r: np.mean([c['ry'] for c in r]))]
    rows = fill_columns(rows, slope)
    for index, row in enumerate(rows):
        for c in row:
            c['row'] = index
    return rows


def assign_rows(rows, sections, centres):
    """Share rows out between sections in order, as evenly as the count allows.

    The plan gives most sections two rows, but its circles cannot say which
    two: a circle sits in a section's first row in one block and its second
    in the next, and several were placed by fitting rather than read. So the
    split is balanced (sizes differ by at most one) and the circles only
    decide where the shorter sections fall, by keeping each group's middle
    as close to its circle as possible.
    """
    ys = [float(np.mean([c['cy'] for c in r])) for r in rows]
    circles = [centres[s][1] for s in sections]
    n, m = len(rows), len(sections)
    lo = max(1, n // m)
    sizes = {lo, lo + 1} if n % m else {lo}
    inf = float('inf')
    best = [[inf] * (n + 1) for _ in range(m + 1)]
    back = [[0] * (n + 1) for _ in range(m + 1)]
    best[0][0] = 0.0
    for j in range(1, m + 1):
        for i in range(1, n + 1):
            for k in sizes:
                if i - k < 0 or best[j - 1][i - k] == inf:
                    continue
                cost = best[j - 1][i - k] + (np.mean(ys[i - k:i]) - circles[j - 1]) ** 2
                if cost < best[j][i]:
                    best[j][i], back[j][i] = cost, k
    if best[m][n] == inf:
        raise SystemExit(f'cannot share {n} rows between {m} sections')
    bounds, i = [], n
    for j in range(m, 0, -1):
        bounds.append((i - back[j][i], i))
        i -= back[j][i]
    bounds.reverse()
    return [(s, [c for r in rows[a:b] for c in r]) for s, (a, b) in zip(sections, bounds)]


def assign_columns(cells, sections, centres):
    xs = {s: centres[s][0] for s in sections}
    out = {s: [] for s in sections}
    for c in cells:
        out[min(sections, key=lambda s: abs(xs[s] - c['cx']))].append(c)
    return list(out.items())


def build():
    gray = cv2.imread(str(PLAN), cv2.IMREAD_GRAYSCALE)
    centres = {int(k): tuple(v) for k, v in json.loads(CENTRES.read_text()).items()}
    centres.update(EXTRA_CENTRES)
    cells = find_cells(gray)

    sections, report = {}, []
    left = []
    for c in cells:
        for b in BLOCKS:
            # Irregular plots belong to the blocks of large plots drawn one by one;
            # in a gridded block one is a neighbouring perimeter plot poking in.
            fits = not c.get('polygon') if b.get('regular', True) else is_upright(c)
            if fits and is_upright(c) and inside(b['outline'], c['cx'], c['cy']):
                b.setdefault('cells', []).append(c)
                break
        else:
            left.append(c)

    for b in BLOCKS:
        bc = b.get('cells', [])
        if b['mode'] == 'single':
            # Blocks of large plots are drawn individually; there is no grid to repair.
            rows = rows_of(bc) if b.get('regular', True) else [bc]
            groups = [(b['section'], [c for r in rows for c in r])]
        elif b['mode'] == 'rows':
            rows = rows_of(bc)
            groups = assign_rows(rows, b['sections'], centres)
        else:
            groups = assign_columns(bc, b['sections'], centres)
        for s, sc in groups:
            sections.setdefault(s, []).extend(sc)
        report.append((b['name'], len(bc), sum(len(sc) for _, sc in groups),
                       len(rows) if b['mode'] != 'columns' else '-'))

    unplaced = []
    for c in left:
        placed = False
        for p in PERIMETER:
            d, at, seg = distance_along(p['path'], c['cx'], c['cy'])
            if p['band'][0] <= d < p['band'][1]:
                c['along'], c['seg'] = at, seg
                sections.setdefault(p['section'], []).append(c)
                placed = True
                break
        if not placed:
            unplaced.append(c)

    for s in sections:
        sections[s] = drop_overlaps(sections[s])

    # Order plots for numbering: perimeter rows along their path, blocks row by
    # row, top to bottom then left to right.
    for s, sc in sections.items():
        if all('along' in c for c in sc):
            sc.sort(key=lambda c: c['along'])
            sc[:] = fill_strip(sc)
        else:
            # Row order where rows were recovered; otherwise by position, in bands
            # a plot tall, for the blocks of large plots drawn one by one.
            h = float(np.median([c['h'] for c in sc])) if sc else 1
            sc.sort(key=lambda c: (c['row'], c['cx']) if 'row' in c else (round(c['cy'] / (0.9 * h)), c['cx']))
    return sections, report, unplaced, centres


def section_outline(sc, concave=False):
    """A section's outline: the hull of its plots, or for a perimeter row the
    row's own shape. A hull would wrap an L-shaped row round the whole corner
    of the site it encloses."""
    if not concave:
        hull = cv2.convexHull(np.array([p for c in sc for p in c['quad']], np.float32))
        approx = cv2.approxPolyDP(hull, 2, True).reshape(-1, 2)
        return ' '.join(f'{round(x)} {round(y)}' for x, y in approx)
    mask = np.zeros((3072, 4096), np.uint8)
    for c in sc:
        cv2.fillPoly(mask, [np.array(c['quad'], np.int32)], 255)
    # Bridge the row's own gaps (a corner, a missing plot) so it traces as one piece.
    for a, b in zip(sc, sc[1:]):
        cv2.line(mask, (round(a['cx']), round(a['cy'])), (round(b['cx']), round(b['cy'])), 255, 30)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((41, 41), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(contour, 4, True).reshape(-1, 2)
    return ' '.join(f'{round(x)} {round(y)}' for x, y in approx)


def code_prefix(s):
    for b in BLOCKS:
        if b.get('section') == s and b.get('code'):
            return b['code']
    return f'S{s}'


def lot_type(c, standard):
    ratio = c['area'] / standard
    return 'family' if ratio >= FAMILY_AT else 'double' if ratio >= DOUBLE_AT else 'single'


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'report'
    sections, report, unplaced, centres = build()
    total = sum(len(v) for v in sections.values())
    if mode == 'report':
        for name, found, placed, rows in report:
            print(f'{name:10s} cells {found:5d} plots {placed:5d} rows {rows}')
        print('sections', ' '.join(f'{s}:{len(v)}' for s, v in sorted(sections.items())))
        print('plots', total, 'unplaced', len(unplaced))
        return
    if mode == 'preview':
        gray = cv2.imread(str(PLAN), cv2.IMREAD_GRAYSCALE)
        vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        rng = np.random.default_rng(7)
        for s, sc in sections.items():
            col = tuple(int(v) for v in rng.integers(40, 230, 3))
            for c in sc:
                cv2.fillPoly(vis, [np.array(c['quad'], np.int32)], col)
        vis = cv2.addWeighted(vis, 0.55, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), 0.45, 0)
        for c in unplaced:
            cv2.polylines(vis, [np.array(c['quad'], np.int32)], True, (0, 0, 255), 2)
        for s, sc in sections.items():
            if sc:
                x, y = sc[0]['bbox'][:2]
                cv2.putText(vis, str(s), (int(x), int(y) - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (20, 20, 160), 2)
        out = sys.argv[2] if len(sys.argv) > 2 else 'preview.png'
        cv2.imwrite(out, vis)
        print('wrote', out)
        return
    if mode == 'sql':
        write_sql(sections, centres)
        print('wrote', OUT_SQL, 'plots', total)


def write_sql(sections, centres):
    standard = float(np.median([c['area'] for sc in sections.values() for c in sc]))
    lines = [
        '-- Every plot on the survey plan, traced from public/traces/survey-lines.png',
        '-- by tools/trace_plan.py. Regenerate with `python3 tools/trace_plan.py sql`;',
        '-- do not edit by hand.',
        '--',
        '-- Coordinates are the plan\'s own pixels on its 4096x3072 sheet. Upright plots',
        '-- are stored as rectangles. The rest, the tilted perimeter rows and the plots cut',
        '-- by a diagonal walk, also carry their outline in svg_points, with the rectangle',
        '-- as its bounding box.',
        '--',
        '-- Lot codes are <section>-<nnn>, numbered row by row, top to bottom and left',
        '-- to right, or along the row for the perimeter sections. The northern strips',
        '-- carry no circled number on the plan and are coded NA and NB.',
        '--',
        '-- Run after the schema: `make map-data`. Re-running replaces every plot, and',
        '-- with them the reservations and burials that point at plots.',
        '',
        '-- Sections the plan draws but the schema seed does not number, and the',
        '-- outline of every section as traced.',
        'INSERT INTO `cemetery_sections` (`section_name`, `description`, `section_number`, `svg_viewbox`, `svg_points`) VALUES',
    ]
    rows = []
    for s in sorted(sections):
        sc = sections[s]
        if not sc:
            continue
        x0 = min(c['bbox'][0] for c in sc); y0 = min(c['bbox'][1] for c in sc)
        x1 = max(c['bbox'][2] for c in sc); y1 = max(c['bbox'][3] for c in sc)
        name = SECTION_NAMES.get(s, f'Section {s}')
        note = SECTION_NOTES.get(s, f'Survey section {s}')
        vb = f'{round(x0)} {round(y0)} {round(x1 - x0)} {round(y1 - y0)}'
        rows.append(f"  ('{name}', '{note}', {s}, '{vb}', '{section_outline(sc, concave=s in PERIMETER_SECTIONS)}')")
    lines.append(',\n'.join(rows))
    lines += [
        'ON DUPLICATE KEY UPDATE `svg_viewbox` = VALUES(`svg_viewbox`), `svg_points` = VALUES(`svg_points`);',
        '',
        'DELETE FROM `cemetery_lots`;',
        '',
    ]
    for s in sorted(sections):
        sc = sections[s]
        if not sc:
            continue
        prefix = code_prefix(s)
        values = []
        for k, c in enumerate(sc, 1):
            x0, y0, x1, y1 = c['bbox']
            pts = 'NULL' if is_upright(c) and not c.get('polygon') else "'" + ' '.join(f'{round(px)} {round(py)}' for px, py in c['quad']) + "'"
            values.append(
                f"  ('{prefix}-{k:03d}', (SELECT section_id FROM cemetery_sections WHERE section_number = {s}), "
                f"'{lot_type(c, standard)}', {PRICE:.2f}, {x0:.2f}, {y0:.2f}, {x1 - x0:.2f}, {y1 - y0:.2f}, {pts})")
        lines.append('INSERT INTO `cemetery_lots` (`lot_code`, `section_id`, `lot_type`, `price`, `svg_x`, `svg_y`, `svg_w`, `svg_h`, `svg_points`) VALUES')
        lines.append(',\n'.join(values) + ';')
        lines.append('')
    OUT_SQL.write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
