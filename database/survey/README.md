# Survey geometry

Every plot on the map is traced by `tools/trace_plan.py` from the clean redraw of
the plan's line work, `public/traces/cemetery-base.png`, which sits within a pixel
of the scanned plan `public/traces/survey-lines.png` (4096 x 3072) shown on the map. The
plan is the map's coordinate space, so a plot's stored rectangle or outline is
in the plan's own pixels and lands on the plot as drawn.

## Files

| File | Role |
|---|---|
| `lots.sql` | Generated. Every section outline and every plot. Loaded by `make map-data`. |
| `section-centres.json` | The circled section numbers, in plan pixels. Decides which rows belong to which section. |
| `sections-traced.json`, `check-crypt-lots.png` | Output of the earlier tracer that covered only the left block and crypts. Kept for reference; not used. |

## Regenerating

```bash
python3 tools/trace_plan.py report            # counts per block and section
python3 tools/trace_plan.py preview out.png   # every plot over the plan, coloured by section
python3 tools/trace_plan.py sql               # rewrites lots.sql
make migrate && make map-data && make demo && make verify-map
```

The script needs numpy and OpenCV; its docstring has a one-line `nix shell`.

## Method

1. **Lines.** The clean drawing's strokes, thickened a pixel to close hairline
   gaps, plus the scan's long straight strokes (block borders, row lines),
   which close the outer-edge plots the clean drawing's serpentine paths leave
   open. Along Section 64, where the clean drawing leaves out the dividers,
   the scan's lines are used directly.
2. **Plots.** Each patch of paper enclosed by lines, inside the drawn site, is
   a candidate plot. Holes (a digit, a pencil box) are filled before measuring.
   Rectangular patches are plots; large convex ones are the trapezoids and
   triangles a diagonal walk cuts, kept as outlines.
3. **Blocks.** Plots are grouped into the plan's blocks by outlines read off the
   plan by eye (they only need to fall in the walks between blocks). Tilted
   plots are the perimeter rows and are placed by the site edge they follow.
4. **Rows.** Within a block, rows are recovered after straightening the
   block's slight tilt. Slivers a pencil stroke cut from a plot are merged,
   and a cell the clean drawing left a line out of is cut only where the scan
   draws that line. Gaps are left as drawn. Perimeter rows get gap filling
   along the edge, since their plots are evenly spaced.
5. **The fold.** The sheet was folded, and the fold runs down its east side
   through blocks 42-47, 48-55, 65 and 66. It reads as a line in the scan, and
   the clean drawing follows it in places, but it is never a plot's edge: the
   plot it crosses is drawn wider where the paper buckled. Each of those blocks
   lists its column lines either side of the fold, and every row is re-cut
   along them as the row itself draws them. These plots keep their row's lot
   type rather than the type their width alone would give.
6. **Northern strips.** The clean drawing outlines them but does not divide
   them, so they are read off the scan as a grid: row lines followed along the
   strip, then each row's column lines. A column line hidden under the fold's
   smudge is found as the faint stroke nearest its share of the gap, a row
   line too faint to follow is cut as an even share of the band, and a row
   that runs out to the strip's slanted end keeps the plots the edge cuts.
7. **Sections.** A block's rows are shared out between its circled numbers in
   order, as evenly as the count allows (most sections are two rows). The
   circles only decide where a shorter section falls: their positions are not
   precise enough to say which row each starts on.
8. **Numbering.** Codes are `S<section>-<nnn>`, row by row, top to bottom then
   left to right, or along the row for the perimeter sections.

## Coverage

70 sections, 6,735 plots: every block the plan draws.

| Area | Sections | Notes |
|---|---|---|
| Left blocks | 3-20 | |
| Chapel block | 21-24 | Split by column; the circles sit side by side. |
| Lettered blocks | 25-41 | The two wedges under Section 31 hold notes, not plots. |
| East blocks | 42-63, 65 | |
| South blocks | 66-68 | Large plots, kept as drawn, end plots as outlines. |
| Inner east row | 64 | |
| Perimeter | 1 (west and south), 2 (east and south-east) | Circled on the plan, missing from the old seed. Section 1 is plots 1-34 down the west wall and along the south wall; Section 2 is plots 1-64 down the east wall and back up the south-east diagonal. Codes match the numbers printed in the plots. |
| Northern strips | 69, 70 | No circled number on the plan. Named North Strip A and B and coded `NA-`, `NB-`; the section numbers are internal. |

## What to check against the plan

- **Section boundaries within a block.** Rows are shared out evenly; where a
  block's row count does not divide by its sections, which section gets the
  odd row is the tracer's best fit, not something the plan states.
- **Lot numbers.** Codes follow position. In the perimeter sections that is
  the plan's own numbering (checked plot by plot for Sections 1 and 2); in the
  blocks the small figures in the plots are not read.
- **Lot type.** A plot over 1.7x the median area is a double, over 3.2x a
  family plot. The cemetery may sell them differently.
- **North strips under the pencil crosses.** About 45 column lines in the
  northern strips are hidden under crosses drawn over the plots or under the
  fold's smudge, and are placed as the nearest faint stroke. Each is within a
  few pixels; whether a line is there at all is not in doubt.
- **Narrow columns.** The plan draws narrow columns, about half a plot wide,
  between groups in the northern strips and in places in the blocks. Each is
  kept as a plot, as drawn.
