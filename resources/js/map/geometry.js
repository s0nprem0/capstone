import { MAP_VIEWBOX } from './tracePaths'

const SECTION_COLORS = [
  '#2c5530',
  '#1d4ed8',
  '#7c3aed',
  '#b45309',
  '#0e7490',
  '#be123c',
  '#4d7c0f',
  '#9333ea',
  '#0891b2',
]

// Keyed off the id rather than the section's position in the list, so adding or
// removing a section does not repaint every other one.
export const sectionColor = (sectionId) =>
  SECTION_COLORS[(Math.max(1, Number(sectionId) || 1) - 1) % SECTION_COLORS.length]

// The frame is clamped to the same ceiling the zoom controls use, so a fit can
// never produce a view the user cannot zoom back out of. The floor is looser
// than the zoom floor on purpose: framing a handful of matches wants to sit
// closer than framing the whole site, without inflating one plot to fill a pane.
export const MAX_VIEW = 6500
export const MIN_FRAME = 640
// A frame never brings the plan closer than this many screen pixels per plan
// unit. A two-row section is otherwise stretched across a wide pane until the
// scan blurs and nothing around it is left to say where it is.
export const FRAME_PX_PER_UNIT = 1

// On-screen size of an overview section label, in CSS pixels.
const SECTION_LABEL_PX = 11
const SECTION_LABEL_GAP_PX = 3

const unionRect = (a, b) =>
  a
    ? [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[2], b[2]),
        Math.max(a[3], b[3]),
      ]
    : b

export const lotsBounds = (lots) =>
  lots.length === 0
    ? null
    : lots.reduce(
        (acc, lot) =>
          unionRect(acc, [lot.svg_x, lot.svg_y, lot.svg_x + lot.svg_w, lot.svg_y + lot.svg_h]),
        [Infinity, Infinity, -Infinity, -Infinity]
      )

export const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : [...MAP_VIEWBOX]
}

export const pointsBounds = (points, fallback) => {
  const values = String(points || '')
    .split(/[ ,]+/)
    .map(Number)
    .filter(Number.isFinite)
  if (values.length < 6 || values.length % 2 !== 0) return fallback
  const xs = values.filter((_, index) => index % 2 === 0)
  const ys = values.filter((_, index) => index % 2 === 1)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// A section's outline is its real extent; the stored crop rectangle is only the
// fallback for the sections that have no traced outline yet.
export const sectionBounds = (section) => {
  const [x, y, w, h] = parseViewBox(section.viewBox)
  return pointsBounds(section.points, [x, y, x + w, y + h])
}

/**
 * The viewBox that shows `bounds` filling a pane of the given aspect ratio.
 *
 * Growing the short axis to the pane's shape is what stops a wide section
 * floating in blank paper. That only works because the whole site is drawn at
 * every zoom, so the space the frame opens up is neighbouring plots — and
 * `within` is what keeps that space on the cemetery: a section at the north
 * edge would otherwise expand upwards into nothing at all.
 *
 * @param {[number, number, number, number]} bounds minX, minY, maxX, maxY
 * @param {[number, number, number, number]} [within] the area to stay inside
 */
export const frame = (bounds, aspect, within = null, minWidth = MIN_FRAME) => {
  const [x0, y0, x1, y1] = bounds
  const padding = Math.max(x1 - x0, y1 - y0) * 0.04
  const width = Math.max(x1 - x0, 1) + padding * 2
  const height = Math.max(y1 - y0, 1) + padding * 2

  const viewWidth = Math.min(MAX_VIEW, Math.max(minWidth, Math.max(width, height * aspect)))
  const viewHeight = viewWidth / aspect

  const centreX = (x0 + x1) / 2
  const centreY = (y0 + y1) / 2
  let left = centreX - viewWidth / 2
  let top = centreY - viewHeight / 2

  if (within) {
    // Slide rather than shrink: where the frame cannot sit fully inside the
    // site, it is centred on the site instead of showing the void beyond it.
    const [wx0, wy0, wx1, wy1] = within
    const siteWidth = Math.max(wx1 - wx0, 1)
    const siteHeight = Math.max(wy1 - wy0, 1)

    const clamp = (start, extent, limit, limitExtent) =>
      extent >= limitExtent
        ? limit + limitExtent / 2 - extent / 2
        : Math.min(Math.max(start, limit), limit + limitExtent - extent)

    left = clamp(left, viewWidth, wx0, siteWidth)
    top = clamp(top, viewHeight, wy0, siteHeight)
  }

  return [left, top, viewWidth, viewHeight]
}

// S42-095 -> 95: the plan prints plot numbers, not codes, and a code is wider
// than the plot it would label.
export const plotNumber = (code) => String(Number(String(code).split('-').pop()) || code)

// "Section 42" -> "42": the overview has room for the number, not the word.
export const shortSectionName = (name) => String(name).replace(/^section\s+/i, '')

/**
 * Where each section's overview label goes: on the plot nearest the middle of
 * its plots. The middle of the outline will not do -- the perimeter strips wrap
 * the whole site, so theirs lands in someone else's section.
 */
export const sectionAnchors = (sections, lots) => {
  const bySection = new Map()
  for (const lot of lots) {
    const list = bySection.get(lot.section_id)
    if (list) list.push(lot)
    else bySection.set(lot.section_id, [lot])
  }
  return sections.flatMap((section) => {
    const own = bySection.get(section.section_id)
    if (!own) return []
    const centre = (l) => [l.svg_x + l.svg_w / 2, l.svg_y + l.svg_h / 2]
    const mx = own.reduce((sum, l) => sum + centre(l)[0], 0) / own.length
    const my = own.reduce((sum, l) => sum + centre(l)[1], 0) / own.length
    let best = own[0]
    let bestDist = Infinity
    for (const lot of own) {
      const [cx, cy] = centre(lot)
      const dist = (cx - mx) ** 2 + (cy - my) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = lot
      }
    }
    const [x, y] = centre(best)
    return [{ section, x, y, text: shortSectionName(section.section_name), weight: own.length }]
  }).sort((a, b) => b.weight - a.weight)
}

/**
 * The labels that fit at this zoom. Larger sections claim their place first,
 * and a label that would overlap one already placed is left off rather than
 * piling the 70 numbers on top of each other.
 */
export const placeLabels = (anchors, pxPerUnit) => {
  if (pxPerUnit <= 0) return []
  const placed = []
  const boxes = []
  const halfHeight = SECTION_LABEL_PX * 0.8 + SECTION_LABEL_GAP_PX
  for (const anchor of anchors) {
    const halfWidth = (anchor.text.length * SECTION_LABEL_PX * 0.62) / 2 + SECTION_LABEL_PX * 0.5 + SECTION_LABEL_GAP_PX
    const sx = anchor.x * pxPerUnit
    const sy = anchor.y * pxPerUnit
    const box = [sx - halfWidth, sy - halfHeight, sx + halfWidth, sy + halfHeight]
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
    boxes.push(box)
    placed.push(anchor)
  }
  return placed
}
