// Plot geometry for the Lot Editor. A plot is its box (svg_x..svg_h) and, for
// the tilted perimeter rows and plots a diagonal walk cuts, a traced outline
// whose bounding box that is. Every edit goes through reshape(), so a traced
// plot moves and stretches with its box instead of losing its outline.

export const MIN_SIZE = 4

export const round2 = (n) => Math.round(n * 100) / 100

export const parsePoints = (s) => {
  const nums = String(s || '')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const pts = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
  return pts
}

export const geometryOf = (lot) => ({
  svg_x: lot.svg_x,
  svg_y: lot.svg_y,
  svg_w: lot.svg_w,
  svg_h: lot.svg_h,
  svg_points: lot.svg_points ?? null,
})

export function reshape(lot, box) {
  const next = {
    svg_x: round2(Math.max(0, box.x)),
    svg_y: round2(Math.max(0, box.y)),
    svg_w: Math.max(MIN_SIZE, round2(box.w)),
    svg_h: Math.max(MIN_SIZE, round2(box.h)),
  }
  if (lot.svg_points) {
    const sx = lot.svg_w > 0 ? next.svg_w / lot.svg_w : 1
    const sy = lot.svg_h > 0 ? next.svg_h / lot.svg_h : 1
    next.svg_points = parsePoints(lot.svg_points)
      .map(([px, py]) => {
        const x = round2(Math.max(0, next.svg_x + (px - lot.svg_x) * sx))
        const y = round2(Math.max(0, next.svg_y + (py - lot.svg_y) * sy))
        return `${x} ${y}`
      })
      .join(' ')
  }
  return next
}

export const moveBy = (lot, dx, dy) =>
  reshape(lot, { x: lot.svg_x + dx, y: lot.svg_y + dy, w: lot.svg_w, h: lot.svg_h })

export const resizeBy = (lot, dw, dh) =>
  reshape(lot, { x: lot.svg_x, y: lot.svg_y, w: lot.svg_w + dw, h: lot.svg_h + dh })

export const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const boxOf = (lot) => ({ x: lot.svg_x, y: lot.svg_y, w: lot.svg_w, h: lot.svg_h })

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// A new plot is sized like the plots already in its section; surveyed graves
// are about 16 x 41 units, so a fixed square drew something no grave is.
export const typicalSize = (lots) => ({
  w: median(lots.map((l) => l.svg_w)) ?? 16,
  h: median(lots.map((l) => l.svg_h)) ?? 40,
})

// The section's drawn outline, else the extent of its plots, else its viewBox.
// The viewBox is a full-width band across the site, so placing from it drops
// a plot at the map's left edge rather than in the section.
export function plotArea(section, lots) {
  const pts = parsePoints(section?.points)
  if (pts.length >= 3) {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (lots.length) {
    const x = Math.min(...lots.map((l) => l.svg_x))
    const y = Math.min(...lots.map((l) => l.svg_y))
    return {
      x,
      y,
      w: Math.max(...lots.map((l) => l.svg_x + l.svg_w)) - x,
      h: Math.max(...lots.map((l) => l.svg_y + l.svg_h)) - y,
    }
  }
  const [x, y, w, h] = String(section?.viewBox || '0 0 4096 3072').split(/\s+/).map(Number)
  return { x, y, w, h }
}

const collides = (box, lots) => lots.some((l) => overlaps(box, boxOf(l)))

// Where a new plot goes. Beside the plot it was made from (right, below,
// left, above), else the first gap in the section, else under its last row.
export function placeNewLot({ area, lots, size, from }) {
  const { w, h } = size
  if (from) {
    const gap = round2(Math.max(0.5, Math.min(w, h) * 0.08))
    const candidates = [
      { x: from.svg_x + from.svg_w + gap, y: from.svg_y },
      { x: from.svg_x, y: from.svg_y + from.svg_h + gap },
      { x: from.svg_x - w - gap, y: from.svg_y },
      { x: from.svg_x, y: from.svg_y - h - gap },
    ]
    const free = candidates.find((c) => c.x >= 0 && c.y >= 0 && !collides({ ...c, w, h }, lots))
    if (free) return { x: round2(free.x), y: round2(free.y) }
  }
  const step = Math.max(2, Math.min(w, h) / 2)
  for (let y = area.y; y + h <= area.y + area.h; y += step) {
    for (let x = area.x; x + w <= area.x + area.w; x += step) {
      if (!collides({ x, y, w, h }, lots)) return { x: round2(x), y: round2(y) }
    }
  }
  return { x: round2(area.x + (area.w - w) / 2), y: round2(area.y + area.h + h * 0.25) }
}

// The plan prints a plot's number, not its code: S6-007 is "7" on the sheet.
export const shortLabel = (code) => {
  const tail = String(code || '').split('-').pop()
  return /^\d+$/.test(tail) ? String(Number(tail)) : tail
}

export const byCode = (a, b) =>
  String(a.lot_code).localeCompare(String(b.lot_code), undefined, { numeric: true })
