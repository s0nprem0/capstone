#!/usr/bin/env python3
"""Extract cemetery plot geometry from a Photoshop lines-layer export.

The traced layer is dark strokes on light paper, so each plot is a bounded
region of paper. Flood filling the paper and keeping the enclosed regions
gives the plots directly, as near-rectangular cells.

Only fully enclosed cells come back this way, which is why the report splits
them from the open blocks: an open block is a region that bleeds past its
neighbours, so it still needs subdividing (or a hand trace).

    usage: trace_extract.py lines.png [-o geometry.json]

Coordinates are source pixels. Registration to map space is a separate affine
step, so this stays a pure geometry pass.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pacman -S python-pillow")

# Paper sits at L>=217 and strokes run well below; 200 keeps the anti-aliased
# fringe out of the walls without dropping thin lines.
PAPER_MIN = 200

# A plot at survey scale is a few dozen pixels on a side; anything below this
# is a gap between two walls, not a plot.
MIN_CELL_W = 14
MIN_CELL_H = 10

# Above this the region is an unsubdivided block, not a plot.
MAX_PLOT_AREA = 90_000

# How much of its bounding box a region must fill to count as rectangular.
# A real plot is drawn as a rectangle, so this separates plots from blobs of
# paper that happen to be bounded by strokes elsewhere on the sheet.
MIN_FILL_RATIO = 0.80


def load_paper(path: str) -> tuple[int, int, bytearray]:
    """Mask of the paper: 1 where the pixel is light."""
    image = Image.open(path).convert("L")
    width, height = image.size
    pixels = image.load()
    paper = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if pixels[x, y] >= PAPER_MIN:
                paper[row + x] = 1
    return width, height, paper


def regions(paper: bytearray, width: int, height: int) -> list[dict]:
    """Every 4-connected region of paper, with its bounding box.

    The sheet edge is sealed first so the unbounded background outside the
    trace reads as one region instead of wrapping around the plots.
    """
    for x in range(width):
        paper[x] = 0
        paper[(height - 1) * width + x] = 0
    for y in range(height):
        paper[y * width] = 0
        paper[y * width + width - 1] = 0

    seen = bytearray(width * height)
    found: list[dict] = []

    for start in range(width * height):
        if not paper[start] or seen[start]:
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
                if paper[up] and not seen[up]:
                    seen[up] = 1
                    queue.append(up)
            if y < height - 1:
                down = index + width
                if paper[down] and not seen[down]:
                    seen[down] = 1
                    queue.append(down)
            if x > 0:
                left = index - 1
                if paper[left] and not seen[left]:
                    seen[left] = 1
                    queue.append(left)
            if x < width - 1:
                right = index + 1
                if paper[right] and not seen[right]:
                    seen[right] = 1
                    queue.append(right)

        found.append({
            "area": area, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "w": x1 - x0 + 1, "h": y1 - y0 + 1,
            "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2,
        })

    return found


def classify(found: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split regions into plots and open blocks.

    The largest region is the paper outside the trace, which reaches the sheet
    edge and is not a plot by any measure.
    """
    outside = max(found, key=lambda r: r["area"], default=None)
    rest = [r for r in found if r is not outside]

    plots = []
    blocks = []
    for region in rest:
        box = region["w"] * region["h"]
        fill = region["area"] / box if box else 0.0
        if region["area"] > MAX_PLOT_AREA:
            blocks.append(region)
        elif region["w"] >= MIN_CELL_W and region["h"] >= MIN_CELL_H and fill >= MIN_FILL_RATIO:
            plots.append({**region, "fill": round(fill, 3)})

    plots.sort(key=lambda r: (round(r["cy"] / 40), r["cx"]))
    return plots, blocks


def extract(path: str) -> dict:
    width, height, paper = load_paper(path)
    found = regions(paper, width, height)
    plots, blocks = classify(found)

    return {
        "source": path,
        "size": [width, height],
        "region_count": len(found),
        "plot_count": len(plots),
        "open_block_count": len(blocks),
        "open_blocks": sorted(blocks, key=lambda r: -r["area"]),
        "plots": plots,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="traced lines-layer PNG")
    parser.add_argument("-o", "--out", help="write JSON here")
    args = parser.parse_args()

    result = extract(args.image)

    if args.out:
        with open(args.out, "w") as handle:
            json.dump(result, handle, indent=1)

    plots = result["plots"]
    summary = {k: v for k, v in result.items() if k not in ("plots", "open_blocks")}
    print(json.dumps(summary, indent=1))

    if plots:
        widths = [p["w"] for p in plots]
        heights = [p["h"] for p in plots]
        fills = [p["fill"] for p in plots]
        print(f"  plot width   median {statistics.median(widths)}  "
              f"min {min(widths)}  max {max(widths)}")
        print(f"  plot height  median {statistics.median(heights)}  "
              f"min {min(heights)}  max {max(heights)}")
        print(f"  fill ratio   median {statistics.median(fills):.3f}")

    print("  open blocks still to subdivide:")
    for block in result["open_blocks"][:20]:
        print(f"    {block['w']:>5}x{block['h']:<5} at ({block['x0']},{block['y0']})"
              f"  area {block['area']}")
    if len(result["open_blocks"]) > 20:
        print(f"    ... and {len(result['open_blocks']) - 20} more")


if __name__ == "__main__":
    main()