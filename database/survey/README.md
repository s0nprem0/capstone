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
   open. Inside the two northern strips and Section 64, where the clean
   drawing leaves out the dividers, the scan's lines are used directly.
2. **Plots.** Each patch of paper enclosed by lines, inside the drawn site, is
   a candidate plot. Holes (a digit, a pencil box) are filled before measuring.
   Rectangular patches are plots; large convex ones are the trapezoids and
   triangles a diagonal walk cuts, kept as outlines.
3. **Blocks.** Plots are grouped into the plan's blocks by outlines read off the
   plan by eye (they only need to fall in the walks between blocks). Tilted
   plots are the perimeter rows and are placed by the site edge they follow.
4. **Rows.** Within a block, rows are recovered after straightening the
   block's slight tilt. Slivers a pencil stroke cut from a plot are merged,
   pairs a missing line merged are split, and gaps of up to four plots a faint
   line left are filled. Perimeter rows get the same gap filling along the edge.
5. **Sections.** A block's rows are shared out between its circled numbers in
   order, as evenly as the count allows (most sections are two rows). The
   circles only decide where a shorter section falls: their positions are not
   precise enough to say which row each starts on.
6. **Numbering.** Codes are `S<section>-<nnn>`, row by row, top to bottom then
   left to right, or along the row for the perimeter sections.

## Coverage

70 sections, 6,869 plots: every block the plan draws.

| Area | Sections | Notes |
|---|---|---|
| Left blocks | 3-20 | |
| Chapel block | 21-24 | Split by column; the circles sit side by side. |
| Lettered blocks | 25-41 | |
| East blocks | 42-63, 65 | |
| South blocks | 66-68 | Large plots, kept as drawn, end plots as outlines. |
| Inner east row | 64 | |
| Perimeter | 1 (west and south), 2 (east) | Circled on the plan, missing from the old seed. |
| Northern strips | 69, 70 | No circled number on the plan. Named North Strip A and B and coded `NA-`, `NB-`; the section numbers are internal. |

## What to check against the plan

- **Section boundaries within a block.** Rows are shared out evenly; where a
  block's row count does not divide by its sections, which section gets the
  odd row is the tracer's best fit, not something the plan states.
- **Lot numbers.** The plan's own numbering (the small figures in the plots and
  the numbers in the perimeter rows) is not read. Codes follow position.
- **Lot type.** A plot over 1.7x the median area is a double, over 3.2x a
  family plot. The cemetery may sell them differently.
- **North strips.** Traced from the scan alone, whose pencil grid is dense and
  smudged; a few plots there may be split or missing.
