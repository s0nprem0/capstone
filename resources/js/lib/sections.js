const parsePoints = (points) => {
  const n = String(points || '').trim().split(/[\s,]+/).map(Number)
  const out = []
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]])
  return out
}

const pointToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Gap between two outlines: every vertex of each against every edge of the
// other. Vertex-to-vertex alone misses neighbours that share a long edge.
const outlineGap = (a, b) => {
  let gap = Infinity
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const p of from) {
      for (let i = 0; i < to.length; i++) {
        gap = Math.min(gap, pointToSegment(p, to[i], to[(i + 1) % to.length]))
      }
    }
  }
  return gap
}

// The section whose drawn outline sits closest to this one, so a plot can be
// described in words ("Section 9, near Section 10") rather than leaving the
// reader to find it on the plan. Sections not yet placed on the plan have no
// outline and are skipped.
export function nearestSection(section, sections) {
  const own = parsePoints(section?.points)
  if (own.length < 3) return null
  let best = null
  let bestGap = Infinity
  for (const other of sections) {
    if (String(other.section_id) === String(section.section_id)) continue
    const outline = parsePoints(other.points)
    if (outline.length < 3) continue
    const gap = outlineGap(own, outline)
    if (gap < bestGap) {
      bestGap = gap
      best = other
    }
  }
  return best
}
