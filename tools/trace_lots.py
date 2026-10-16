#!/usr/bin/env python3
"""Recover section lots from a traced lines layer.

Input is the lines layer exported from the Photoshop trace, plus the survey's
section centres. Output is one entry per section, each holding the lots drawn
inside it, in the trace's own pixel space.

Why two inputs: the trace gives the lot geometry but says nothing about which
section a lot belongs to, and the survey plan says which section each numbered
row is but has no usable geometry. This joins them by position.

Procedure:

1. Flood fill the paper. A traced lot is an enclosed region of paper, so every
   region big enough to be a lot is one.
2. Group the lots into rows by vertical position. A row is a run of lots at
   the same height, and the circled numbers run down the margin of each block,
   one per row.
3. Name each row after the nearest section centre. A row whose centre is far
   from every circle, or which holds too few lots to be a row, is not part of
   the trace and is dropped.
4. Merge the halves. Rows are commonly drawn with a horizontal division
   splitting each lot in two, so lots that share a column and touch are joined
   back into the single lot the plan labels.

    usage: trace_lots.py lines.png section-centres.json [-o sections.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pacman -S python-pillow")

# Paper sits at L>=217 and the strokes run well below it; 200 keeps the
# anti-aliased fringe out of the walls without dropping thin lines.
PAPER_MIN = 200

# A lot is a few dozen pixels on a side at trace resolution.
MIN_LOT_W = 14
MIN_LOT_H = 10

# Above this the region is an undivided block, not a lot.
MAX_LOT_AREA = 90_000

# A lot is drawn as a rectangle, so a region filling less of its bounding box
# than this is a pocket of paper bounded by strokes elsewhere on the sheet.
MIN_FILL = 0.80

# How far a row of lots may sit from a section centre before it is a different
# section's row.
ROW_TOLERANCE = 60

# Lots closer together vertically than this are in the same row.
ROW_GAP = 30

# A row holding fewer lots than this is not a row of the survey.
MIN_ROW_LOTS = 10

# Two stacked halves of one lot are no further apart than this.
HALF_GAP = 22


def paper_mask(path: str) -> tuple[int, int, bytearray]:
    image = Image.open(path).convert("L")
    width, height = image.size
    pixels = image.load()
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if pixels[x, y] >= PAPER_MIN:
                mask[row + x] = 1
    return width, height, mask


def enclosed_regions(mask: bytearray, width: int, height: int) -> list[dict]:
    """Every 4-connected region of paper, bounded by the strokes."""
    # Seal the sheet edge so the paper outside the trace is one region rather
    # than a frame wrapped around all the lots.
    for x in range(width):
        mask[x] = 0
        mask[(height - 1) * width + x] = 0
    for y in range(height):
        mask[y * width] = 0
        mask[y * width + width - 1] = 0

    seen = bytearray(width * height)
    regions: list[dict] = []

    for start in range(width * height):
        if not mask[start] or seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        area = 0
        x0 = x1 = start % width
        y0 = y1 = start // width

        while queue:
            index = queue.popleft()
            area += 1
            x, y = index % width, index // width
            if x < x0:
                x0 = x
            if x > x1:
                x1 = x
            if y < y0:
                y0 = y
            if y > y1:
                y1 = y

            if y > 0:
                up = index - width
                if mask[up] and not seen[up]:
                    seen[up] = 1
                    queue.append(up)
            if y < height - 1:
                down = index + width
                if mask[down] and not seen[down]:
                    seen[down] = 1
                    queue.append(down)
            if x > 0:
                left = index - 1
                if mask[left] and not seen[left]:
                    seen[left] = 1
                    queue.append(left)
            if x < width - 1:
                right = index + 1
                if mask[right] and not seen[right]:
                    seen[right] = 1
                    queue.append(right)

        box = (x1 - x0 + 1) * (y1 - y0 + 1)
        regions.append({
            "area": area, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "w": x1 - x0 + 1, "h": y1 - y0 + 1,
            "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2,
            "fill": area / box if box else 0.0,
        })

    return regions


def lot_cells(regions: list[dict]) -> list[dict]:
    """The regions that are lots rather than background or open blocks."""
    if not regions:
        return []
    outside = max(regions, key=lambda r: r["area"])
    return [
        r for r in regions
        if r is not outside
        and r["area"] <= MAX_LOT_AREA
        and r["w"] >= MIN_LOT_W
        and r["h"] >= MIN_LOT_H
        and r["fill"] >= MIN_FILL
    ]


def merge_halves(cells: list[dict]) -> list[dict]:
    """Join the stacked halves of a lot back into one lot.

    Halves share a column, so grouping by column centre and joining anything
    that touches vertically rebuilds the box the plan labels.
    """
    columns: dict[int, list[dict]] = defaultdict(list)
    for cell in cells:
        columns[round((cell["x0"] + cell["x1"]) / 2 / 6)].append(cell)

    lots: list[dict] = []
    for group in columns.values():
        group.sort(key=lambda c: c["y0"])
        current: dict | None = None
        for cell in group:
            if current and cell["y0"] - current["y1"] <= HALF_GAP:
                current["y1"] = max(current["y1"], cell["y1"])
                current["y0"] = min(current["y0"], cell["y0"])
                current["x0"] = min(current["x0"], cell["x0"])
                current["x1"] = max(current["x1"], cell["x1"])
                current["h"] = current["y1"] - current["y0"]
                current["w"] = current["x1"] - current["x0"]
            else:
                if current:
                    lots.append(current)
                current = dict(cell)
        if current:
            lots.append(current)
    return lots


def rows_of(cells: list[dict]) -> list[list[dict]]:
    """Group lots into rows: runs of lots at the same height.

    A row is often drawn as two stacked bands, so the bands are left as one
    row here and joined per column by merge_halves later.
    """
    ordered = sorted(cells, key=lambda c: c["cy"])
    rows: list[list[dict]] = []
    current: list[dict] = []
    for cell in ordered:
        if current and cell["cy"] - current[-1]["cy"] > ROW_GAP:
            rows.append(current)
            current = []
        current.append(cell)
    if current:
        rows.append(current)
    return rows


def build(lines_path: str, centres_path: str) -> dict:
    with open(centres_path) as handle:
        raw_centres = json.load(handle)
    centres = {int(k): (v[0], v[1]) for k, v in raw_centres.items()}

    width, height, mask = paper_mask(lines_path)
    cells = lot_cells(enclosed_regions(mask, width, height))

    by_section: dict[int, list[dict]] = defaultdict(list)
    for row in rows_of(cells):
        mid = (row[0]["cy"] + row[-1]["cy"]) / 2
        section = min(centres, key=lambda s: abs(mid - centres[s][1]))
        if abs(mid - centres[section][1]) > ROW_TOLERANCE:
            continue
        by_section[section].extend(row)

    sections = []
    for section in sorted(by_section):
        if len(by_section[section]) < MIN_ROW_LOTS:
            continue
        lots = merge_halves(by_section[section])
        lots.sort(key=lambda l: (round(l["cy"] / 40), l["cx"]))
        sections.append({
            "section": section,
            "centre": [round(centres[section][0]), round(centres[section][1])],
            "method": "trace",
            "cells": len(by_section[section]),
            "lots": lots,
        })

    return {
        "source": lines_path,
        "canvas": [width, height],
        "section_total": len(sections),
        "cell_total": sum(s["cells"] for s in sections),
        "lot_total": sum(len(s["lots"]) for s in sections),
        "sections": sections,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lines", help="traced lines-layer PNG")
    parser.add_argument("centres", help="section-centres.json")
    parser.add_argument("-o", "--out", help="write JSON here")
    args = parser.parse_args()

    result = build(args.lines, args.centres)

    if args.out:
        with open(args.out, "w") as handle:
            json.dump(result, handle, indent=1)

    print(f"canvas {result['canvas'][0]}x{result['canvas'][1]}"
          f"  sections {result['section_total']}"
          f"  cells {result['cell_total']}"
          f"  lots {result['lot_total']}")
    for section in result["sections"]:
        print(f"  section {section['section']:>2}: {len(section['lots']):>3} lots"
              f"  (from {section['cells']} traced cells)")


if __name__ == "__main__":
    main()