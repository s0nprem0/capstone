# Survey geometry

Geometry recovered from the traced cave at `line detailed.psd`, exported as one
PNG per layer at full canvas (4096 x 3072).

## Inputs

| File | Role |
|---|---|
| `lines_v2.png` | The traced plot strokes. Source of all lot geometry. |
| `sections_v2.png` | The circled numbers, red. One per row of lots. |
| `map.jpg` | The scanned survey plan (2048 x 1536). Reference only. |

`sections_v2.png` is named for the section numbers and `labels_v2.png` is
effectively blank (0.07% dark pixels), so it carries no usable data.

## Method

`tools/trace_lots.py` floods the paper in the lines layer. Each enclosed region
of paper is a lot, because the strokes are the lot walls. Regions are then
grouped into rows and joined back across the horizontal division that splits
most rows into two halves.

The 977 cells recovered are near-perfect rectangles: the median region fills
97.5% of its bounding box, which is what makes the flood-fill approach sound
here and the projection approach unnecessary.

## What is and is not reliable

**Reliable.** The lot geometry for the blocks that are traced: the left block
and the crypts. Cells align with the drawn grid, and the extracted overlay
(`check-crypt-lots.png`) matches the plan.

**Not reliable.** The section a row belongs to. Section centres are roughly
88px apart while rows are roughly 40px apart, so a row is often as close to a
neighbouring circle as to its own. The script's section assignment is a
proposal, not a result. It must be confirmed against the plan in the UI.

**Absent.** The right-hand and middle blocks are not traced. Only faint grid
shows in the scan there, which is not enough to reconstruct the lots, so no
geometry exists for them yet.

## Coverage

| Area | Sections | State |
|---|---|---|
| Left block | 3-11 | traced |
| Crypts | 25-31 | traced |
| Middle block | 12-24 | untraced |
| Right blocks | 32-41 | untraced |
| Right south | 42-68 | untraced |

## Regenerating

```bash
python3 tools/trace_lots.py lines_v2.png section-centres.json -o sections-traced.json
```

`section-centres.json` holds the circled-number positions in canvas pixels. It
was read from `sections_v2.png` by OCR, with the eleven numbers OCR could not
read placed by fitting the survey photo to the traced canvas. The fit used the
55 readable circles as correspondences and has a median residual of 8px;
circle 16 is the worst at 57px and should be checked by eye.

## Open questions

- **Is a merged lot the right unit?** Each row is drawn divided in two, and the
  plan labels one letter per column. If the two halves are separate lots rather
  than one, the counts double.
- **Do the circled numbers carry lot ranges?** The numbers under each letter in
  the plan may be the per-lot numbering, which would give each lot a code.
