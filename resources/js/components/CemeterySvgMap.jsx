import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAP_VIEWBOX } from '../map/tracePaths'
import PlanImage, { levelFor } from '../map/PlanImage'
import PlotShape from '../map/PlotShape'
import ZoomControls, { ControlIcon } from './ZoomControls'
import { LOT_STATUS, money } from '../lib/terms'

export const STATUS_COLORS = {
  available: 'var(--status-available)',
  reserved: 'var(--status-reserved)',
  occupied: 'var(--status-occupied)',
}

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
const MAX_VIEW = 6500
const MIN_FRAME = 640
// A frame never brings the plan closer than this many screen pixels per plan
// unit. A two-row section is otherwise stretched across a wide pane until the
// scan blurs and nothing around it is left to say where it is.
const FRAME_PX_PER_UNIT = 1

// One plan unit is one pixel of the full-resolution survey sheet. Zooming past
// about 2.5 screen pixels per sheet pixel only enlarges the blur, so that is
// the zoom ceiling, whatever the pane's width.
const MAX_PX_PER_UNIT = 2.5
const minViewFor = (paneWidth) => Math.max(150, paneWidth / MAX_PX_PER_UNIT)

// The drawn cemetery on the survey sheet, measured from the scan. The overview
// frames this and every other frame is kept inside it, rather than inside the
// plots: a section on the edge of the plotted area would otherwise be pinned
// to the edge of the pane, and the plan's unplotted strips cut off.
const PLAN_BOUNDS = [290, 190, 3770, 3072]

// Beyond this view width (plan units) the map is in overview detail.
const FAR_VIEW = 2000
// How close a plot chosen from the overview is brought in.
const NEAR_VIEW = 1200
// Width kept clear on the right for the zoom buttons when bringing a plot into
// view, in CSS pixels.
const CONTROLS_PX = 56
const MAX_LABELLED = 80
const MIN_LABEL_PX = 16
// On-screen size of an overview section label, in CSS pixels.
const SECTION_LABEL_PX = 11
const SECTION_LABEL_GAP_PX = 3

// The overview letterboxes a 1.23:1 site into a portrait pane, and a wide
// section worse. Framing on the pane's own shape -- growing the short axis
// until it matches -- is what stops the map floating in blank paper. Only
// works because the whole site is drawn at every zoom (see below), so the
// space the frame opens up is neighbouring plots rather than emptiness.
const DEFAULT_ASPECT = 4096 / 3072

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const unionRect = (a, b) =>
  a
    ? [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[2], b[2]),
        Math.max(a[3], b[3]),
      ]
    : b

const lotsBounds = (lots) =>
  lots.length === 0
    ? null
    : lots.reduce(
        (acc, lot) =>
          unionRect(acc, [lot.svg_x, lot.svg_y, lot.svg_x + lot.svg_w, lot.svg_y + lot.svg_h]),
        [Infinity, Infinity, -Infinity, -Infinity]
      )

const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : [...MAP_VIEWBOX]
}

const pointsBounds = (points, fallback) => {
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
const sectionBounds = (section) => {
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
const frame = (bounds, aspect, within = null, minWidth = MIN_FRAME) => {
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

function LotRect({ lot, dimmed, faded }) {
  // One element per plot rather than a <g> wrapper: the map draws every plot at
  // every zoom, so ~6,400 wrappers (and their <title> tooltips) were pure DOM
  // weight. The click handler targets data-lot-id via closest(), and the state
  // classes live on the rect, which the stylesheet already anticipates
  // (rect.lot--selected). Per-plot detail is on the click-through pane, not a
  // hover tooltip.
  // Status is a tint over the survey plan, set by class in app.css, so the
  // drawn plot and its printed number show through. Labels and the selection
  // ring are drawn in their own layer on top (see map-callouts).
  return (
    <PlotShape
      lot={lot}
      data-lot-id={lot.lot_id}
      className={`lot-rect lot--${lot.status}${dimmed ? ' lot--dimmed' : ''}${faded ? ' lot--faded' : ''}`}
      // Keeps the outline a hairline at every zoom.
      vectorEffect="non-scaling-stroke"
    />
  )
}

// S42-095 -> 95: the plan prints plot numbers, not codes, and a code is wider
// than the plot it would label.
const plotNumber = (code) => String(Number(String(code).split('-').pop()) || code)

const MemoLotRect = memo(LotRect)

// "Section 42" -> "42": the overview has room for the number, not the word.
const shortSectionName = (name) => String(name).replace(/^section\s+/i, '')

/**
 * Where each section's overview label goes: on the plot nearest the middle of
 * its plots. The middle of the outline will not do -- the perimeter strips wrap
 * the whole site, so theirs lands in someone else's section.
 */
const sectionAnchors = (sections, lots) => {
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
const placeLabels = (anchors, pxPerUnit) => {
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

// Hover state lives here rather than in the map, so moving the pointer across
// the site re-renders one small box instead of the 6,700 plot elements.
function HoverTip({ bindRef }) {
  const [tip, setTip] = useState(null)
  useEffect(() => {
    bindRef.current = setTip
    return () => {
      bindRef.current = null
    }
  }, [bindRef])
  if (!tip) return null
  const { lot, x, y, flipX, flipY } = tip
  return (
    <div
      className="map-tooltip"
      role="presentation"
      style={{
        left: x,
        top: y,
        transform: `translate(${flipX ? 'calc(-100% - 14px)' : '14px'}, ${flipY ? 'calc(-100% - 14px)' : '14px'})`,
      }}
    >
      <strong>{lot.lot_code}</strong>
      <span className={`mark mark--${lot.status}`}>{LOT_STATUS[lot.status] || lot.status}</span>
      <span className="map-tooltip-meta">
        {lot.section_name} · {money(lot.price)}
      </span>
    </div>
  )
}

export default function CemeterySvgMap({
  sections,
  contextLots,
  activeSection,
  selectedLotId,
  query,
  onSelectLot,
  onFocusSection,
  onExitSection,
  onClearSearch,
  coverBottom = 0,
}) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const userAdjustedRef = useRef(false)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  const [fillPane, setFillPane] = useState(true)
  const tipRef = useRef(null)
  const hoveredRef = useRef(null)

  const allLots = useMemo(() => sections.flatMap((s) => s.lots || []), [sections])
  const lotsById = useMemo(() => new Map((contextLots || allLots).map((l) => [l.lot_id, l])), [contextLots, allLots])
  const anchors = useMemo(() => sectionAnchors(sections, contextLots || allLots), [sections, contextLots, allLots])

  // A search frames its matches closely enough that whatever the frame opens up
  // has to be there — otherwise ten plots float in an empty box with no way to
  // tell which part of the site they are in. The plots a search filtered out
  // come back as context, faded.
  const fadedLots = useMemo(() => {
    if (!query) return []
    const matched = new Set(allLots.map((l) => l.lot_id))
    return (contextLots || []).filter((l) => !matched.has(l.lot_id))
  }, [query, allLots, contextLots])

  const siteBounds = PLAN_BOUNDS

  // What the map is framing. A search frames whatever it matched, so a result is
  // never left as a few pixels somewhere off-screen; otherwise the open section,
  // otherwise the whole site.
  const focusBounds = useMemo(() => {
    if (query) return lotsBounds(allLots)
    if (activeSection) return sectionBounds(activeSection)
    return siteBounds
  }, [query, allLots, activeSection, siteBounds])

  const focusKey = query
    ? `q:${query}`
    : activeSection
      ? `section-${activeSection.section_id}`
      : 'site'

  const activeSectionId = activeSection?.section_id ?? null

  // Where the view is headed: the end of a fly-to while one is running, else
  // the view itself. Bringing a selected plot into view measures against this,
  // so it does not fight a section frame that is still animating in.
  const targetRef = useRef(vb)

  const setVbBoth = useCallback((next, animating = false) => {
    vbRef.current = next
    if (!animating) targetRef.current = next
    setVb(next)
  }, [])

  const flyTo = useCallback(
    (target) => {
      cancelAnimationFrame(rafRef.current)
      const start = vbRef.current
      // The zoom into a section is a large movement across the site; animating
      // it is disorienting for anyone who has asked the OS for less motion.
      if (prefersReducedMotion()) {
        setVbBoth(target)
        return
      }
      targetRef.current = target
      const t0 = performance.now()
      const dur = 450
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur)
        const e = 1 - Math.pow(1 - k, 3)
        setVbBoth(start.map((s, i) => s + (target[i] - s) * e), k < 1)
        if (k < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [setVbBoth]
  )

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // The pane's own shape, which decides how much room the frame opens up. Zero
  // until the first measurement lands, so the opening fit is not animated from
  // a guess and then immediately re-animated to the real shape.
  const aspect = pane.width > 0 && pane.height > 0 ? pane.width / pane.height : 0

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setPane({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // What the view frames: the section in focus, else the whole site. Framing the
  // site when nothing is focused is what removes the dead margin — the overview
  // used to keep the raw 4096x3072 canvas as its viewBox, so a pane that is not
  // 4:3 letterboxed the plan against its own edges however the window was sized.
  // In fit-sheet mode the canvas is shown whole instead, margins and all.
  const frameTo = useCallback(
    (animate) => {
      const target = fillPane
        ? frame(
            focusBounds || siteBounds,
            aspect || DEFAULT_ASPECT,
            siteBounds,
            Math.max(MIN_FRAME, pane.width / FRAME_PX_PER_UNIT)
          )
        : [...MAP_VIEWBOX]
      userAdjustedRef.current = false
      if (!animate || aspect === 0 || prefersReducedMotion()) setVbBoth(target)
      else flyTo(target)
    },
    [fillPane, focusBounds, siteBounds, aspect, pane.width, setVbBoth, flyTo]
  )

  useEffect(() => {
    frameTo(aspect !== 0)
  }, [focusKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    frameTo(false)
  }, [fillPane]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-frame on resize only while the view is still the one we chose. A window
  // drag must not undo somewhere the user panned to. Not animated: a resize
  // arrives as a stream of sizes, and a tween toward each one lags the pane.
  useEffect(() => {
    if (aspect === 0 || userAdjustedRef.current) return
    frameTo(false)
  }, [aspect]) // eslint-disable-line react-hooks/exhaustive-deps

  // A plot chosen from the list, a link or a search can sit outside the view,
  // or under the zoom buttons. Bring it in, centred, but only then: a plot
  // clicked on the map is already where the eye is, and re-centring on every
  // click would slide the map out from under the pointer. Declared after the
  // section frame above so it measures against where that frame is heading.
  useEffect(() => {
    const lot = selectedLotId == null
      ? null
      : (contextLots || allLots).find((l) => l.lot_id === selectedLotId)
    if (!lot || pane.width === 0) return
    const [x, y, w, h] = targetRef.current
    // On a phone the plot's record slides up over the bottom of the map; only
    // the part above it counts as in view.
    const shown = 1 - coverBottom
    const inset = Math.min(w, h) * 0.08
    const right = x + w - inset - (CONTROLS_PX * w) / pane.width
    const inView =
      lot.svg_x >= x + inset &&
      lot.svg_x + lot.svg_w <= right &&
      lot.svg_y >= y + inset &&
      lot.svg_y + lot.svg_h <= y + h * shown - inset
    if (inView) return
    const nw = Math.min(w, NEAR_VIEW)
    const nh = (nw / w) * h
    const cx = lot.svg_x + lot.svg_w / 2
    const cy = lot.svg_y + lot.svg_h / 2
    flyTo([cx - nw / 2, cy - (nh * shown) / 2, nw, nh])
  }, [selectedLotId, coverBottom, pane.width]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback(
    (px, py, factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [x, y, w, h] = vbRef.current
      const ux = (px / rect.width) * w + x
      const uy = (py / rect.height) * h + y
      const nw = Math.min(MAX_VIEW, Math.max(minViewFor(rect.width), w / factor))
      const nh = (nw / w) * h
      const nx = ux - (px / rect.width) * nw
      const ny = uy - (py / rect.height) * nh
      userAdjustedRef.current = true
      setVbBoth([nx, ny, nw, nh])
    },
    [setVbBoth]
  )

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      // Two fingers down → start a pinch gesture.
      const [a, b] = [...pointersRef.current.values()]
      e.currentTarget.setPointerCapture?.(e.pointerId)
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        vb: [...vbRef.current],
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      dragRef.current = null
      movedRef.current = true
    } else if (pointersRef.current.size === 1) {
      // Deliberately no capture yet. Capturing here retargets the
      // compatibility click to the <svg>, so e.target stops being the plot and
      // closest('[data-lot-id]') finds nothing -- a plain click would select
      // nothing at all. The capture is taken in onPointerMove instead, once
      // the pointer has actually travelled far enough to count as a drag.
      dragRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = false
    }
  }

  const hideTip = () => {
    hoveredRef.current = null
    tipRef.current?.(null)
  }

  // Mouse and pen only: a finger has no hover, and its tap selects the plot.
  const updateTip = (e, rect) => {
    if (e.pointerType === 'touch' || dragRef.current || pinchRef.current) {
      if (hoveredRef.current !== null) hideTip()
      return
    }
    const lotEl = e.target.closest?.('[data-lot-id]')
    const lot = lotEl ? lotsById.get(Number(lotEl.getAttribute('data-lot-id'))) : null
    if (!lot) {
      if (hoveredRef.current !== null) hideTip()
      return
    }
    hoveredRef.current = lot.lot_id
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    tipRef.current?.({ lot, x, y, flipX: x > rect.width - 220, flipY: y > rect.height - 90 })
  }

  const onPointerMove = (e) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    updateTip(e, rect)

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      const start = pinchRef.current
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (start.dist <= 0) return
      const factor = dist / start.dist
      const [x, y, w, h] = start.vb
      const nw = Math.min(MAX_VIEW, Math.max(minViewFor(rect.width), w / factor))
      const nh = (nw / w) * h
      const px = (start.cx - rect.left) / rect.width
      const py = (start.cy - rect.top) / rect.height
      const nx = x + px * w - px * nw
      const ny = y + py * h - py * nh
      userAdjustedRef.current = true
      setVbBoth([nx, ny, nw, nh])
      movedRef.current = true
      return
    }

    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      if (!movedRef.current) {
        movedRef.current = true
        // Past the threshold this is a pan, not a click, so the capture is
        // safe to take now: the click it would have broken is no longer coming.
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
    }
    const [x, y, w, h] = vbRef.current
    userAdjustedRef.current = true
    setVbBoth([x - (dx / rect.width) * w, y - (dy / rect.height) * h, w, h])
    dragRef.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e) => {
    // Only a drag ever took a capture, so this is normally a no-op; guarded
    // because releasePointerCapture throws on a pointer that never had one.
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) dragRef.current = null
  }

  const onSvgClick = (e) => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    const lotEl = e.target.closest?.('[data-lot-id]')
    if (lotEl) {
      const lotId = Number(lotEl.getAttribute('data-lot-id'))
      const lot = allLots.find((l) => l.lot_id === lotId)
      if (lot) onSelectLot(lot)
      return
    }
    const secEl = e.target.closest?.('[data-section-id]')
    if (secEl && !activeSection) {
      const secId = Number(secEl.getAttribute('data-section-id'))
      const section = sections.find((s) => s.section_id === secId)
      if (section) onFocusSection(section)
      return
    }
    // Clicking past the plots steps back out of the section, the same as Escape.
    if (activeSection) onExitSection?.()
  }

  useEffect(() => {
    if (!activeSection) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onExitSection?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeSection, onExitSection])

  const zoomCenter = (factor) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  const fitView = () => frameTo(true)

  const labels = !activeSection && !query ? placeLabels(anchors, pane.width > 0 ? pane.width / vb[2] : 0) : []

  // Double-click or double-tap zooms in on the point, as on any web map.
  const onDoubleClick = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, 2)
  }

  // The map is a tab stop, so it can be moved without a pointer: arrows pan a
  // fifth of the view, + and - zoom on the centre, 0 frames the focus again.
  const onKeyDown = (e) => {
    const [x, y, w, h] = vbRef.current
    const pan = { ArrowLeft: [-w / 5, 0], ArrowRight: [w / 5, 0], ArrowUp: [0, -h / 5], ArrowDown: [0, h / 5] }[e.key]
    if (pan) {
      userAdjustedRef.current = true
      setVbBoth([x + pan[0], y + pan[1], w, h])
    } else if (e.key === '+' || e.key === '=') zoomCenter(1.5)
    else if (e.key === '-' || e.key === '_') zoomCenter(1 / 1.5)
    else if (e.key === '0') fitView()
    else return
    e.preventDefault()
  }

  // CSS pixels per SVG user unit. SVG text is sized in user units, so a value
  // that reads at one zoom fills the screen at another; dividing the target
  // rendered size by this keeps titles and plot labels the same size on screen
  // however far in the map is.
  const pxPerUnit = pane.width > 0 ? pane.width / vb[2] : 0
  const fit = (targetPx) => (pxPerUnit > 0 ? targetPx / pxPerUnit : 0)
  const titleSize = fit(12)
  // Far out, 6,400 plots are specks: only the available ones are tinted, which
  // is the question the overview answers. The rest appear once zoomed in.
  const detail = vb[2] > FAR_VIEW ? 'far' : 'near'
  const selectedLot = selectedLotId == null
    ? null
    : (contextLots || allLots).find((l) => l.lot_id === selectedLotId) || null
  // Search matches get their number when there are few enough to read and each
  // is wide enough on screen to hold it.
  const labelledLots = query && allLots.length <= MAX_LABELLED
    ? allLots.filter((l) => l.svg_w * pxPerUnit >= MIN_LABEL_PX)
    : []
  const noMatches = Boolean(query) && allLots.length === 0

  return (
    <div className="map-svg-wrap">
      <svg
        ref={svgRef}
        className="map-svg"
        data-map-level={activeSection ? 'section-detail' : 'overview'}
        data-detail={detail}
        aria-label={
          activeSection
            ? `${activeSection.section_name} detailed lot map`
            : 'Cemetery overview map, every plot coloured by status'
        }
        viewBox={vb.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={hideTip}
        onClick={onSvgClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        tabIndex={0}
      >
        <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} className="map-paper" />

        <PlanImage level={levelFor(pane.width > 0 ? vb[2] / pane.width : MAP_VIEWBOX[2])} />

        {/* The open section, marked by a halo drawn round its own plots: each is
            stroked wide in the section's colour underneath the plot layer, so the
            strokes merge into one band that follows the rows exactly. A traced
            outline polygon put points on every stepped row end. */}
        {activeSection && (
          <g
            className="section-halo"
            style={{ stroke: sectionColor(activeSection.section_id), fill: sectionColor(activeSection.section_id) }}
            pointerEvents="none"
          >
            {(activeSection.lots || []).map((lot) => (
              <PlotShape key={lot.lot_id} lot={lot} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}

        {/* Every section's plots at every zoom. Cropping to one section is what
            left the frame around it empty; drawing the neighbours instead fills
            it, and the plot you came for grows to twice its overview size. */}
        <g className="map-lots">
          {fadedLots.map((lot) => (
            <MemoLotRect key={lot.lot_id} lot={lot} dimmed faded />
          ))}
          {allLots
            .filter((lot) => activeSectionId === null || lot.section_id === activeSectionId)
            .map((lot) => (
              <MemoLotRect key={lot.lot_id} lot={lot} />
            ))}
          {/* Neighbours are here for context only, dimmed. */}
          {allLots
            .filter((lot) => activeSectionId !== null && lot.section_id !== activeSectionId)
            .map((lot) => (
              <MemoLotRect key={lot.lot_id} lot={lot} dimmed />
            ))}
        </g>

        <g className="map-callouts" pointerEvents="none">
          {labelledLots.map((lot) => (
            <text
              key={lot.lot_id}
              x={lot.svg_x + lot.svg_w / 2}
              y={lot.svg_y + lot.svg_h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="lot-label"
              style={{ fontSize: `${fit(11)}px`, strokeWidth: fit(3) }}
            >
              {plotNumber(lot.lot_code)}
            </text>
          ))}
          {selectedLot && (
            <>
              <PlotShape lot={selectedLot} className="lot-halo" vectorEffect="non-scaling-stroke" />
              <PlotShape lot={selectedLot} className="lot-ring" vectorEffect="non-scaling-stroke" />
              <text
                x={selectedLot.svg_x + selectedLot.svg_w / 2}
                y={selectedLot.svg_y - fit(6)}
                textAnchor="middle"
                className="lot-callout"
                style={{ fontSize: `${fit(14)}px`, strokeWidth: fit(4) }}
              >
                {selectedLot.lot_code}
              </text>
            </>
          )}
        </g>

        {labels.length > 0 && (
          <g className="map-section-labels">
            {labels.map(({ section, x, y, text }) => {
              const height = fit(SECTION_LABEL_PX * 1.6)
              const width = fit(text.length * SECTION_LABEL_PX * 0.62 + SECTION_LABEL_PX)
              return (
                <g key={section.section_id} className="map-section-label" data-section-id={section.section_id}>
                  <title>{`${section.section_name}: ${section.counts?.available ?? 0} available`}</title>
                  <rect
                    x={x - width / 2}
                    y={y - height / 2}
                    width={width}
                    height={height}
                    rx={height / 2}
                    style={{ stroke: sectionColor(section.section_id), strokeWidth: fit(1.5) }}
                  />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: `${fit(SECTION_LABEL_PX)}px` }}>
                    {text}
                  </text>
                </g>
              )
            })}
          </g>
        )}

        <g className="map-sections">
          {sections.map((section) => {
            // The plan has its section numbers printed on it, so a title is
            // only useful for the section actually open; 66 of them at once
            // just pile up in the middle of the site.
            // Not while a plot is selected: its own label sits in the same place
            // when it is in the first row, and the record already names the section.
            if (section.section_id !== activeSectionId || selectedLot) return null
            const [x, y, w, h] = parseViewBox(section.viewBox)
            const [minX, minY, maxX, maxY] = pointsBounds(section.points, [x, y, x + w, y + h])
            return (
              <text
                key={section.section_id}
                x={minX}
                y={minY - fit(8)}
                className="map-section-title"
                // SVG text is in user units, so a fixed size that survives the
                // whole-site overview is enormous once zoomed into a section.
                // Tracking the viewBox keeps a title the same size on screen at
                // every zoom.
                style={{ fontSize: `${titleSize}px`, strokeWidth: titleSize * 0.29 }}
                paintOrder="stroke"
                stroke="#ffffff"
                strokeLinejoin="round"
              >
                {section.section_name}
              </text>
            )
          })}
        </g>
      </svg>

      <HoverTip bindRef={tipRef} />

      <ZoomControls
        onZoomIn={() => zoomCenter(1.5)}
        onZoomOut={() => zoomCenter(1 / 1.5)}
        onFit={fitView}
        fitTitle={activeSection ? 'Re-centre on this section (0)' : 'Re-centre on the cemetery (0)'}
      >
        <button
          type="button"
          onClick={() => setFillPane((v) => !v)}
          aria-pressed={!fillPane}
          aria-label="Show the whole survey sheet"
          title={fillPane ? 'Show the whole survey sheet, margins included' : 'Back to the cemetery, filling the pane'}
        >
          <ControlIcon d={fillPane ? 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4' : 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4'} />
        </button>
      </ZoomControls>

      {noMatches && (
        <div className="map-empty">
          <p>
            No name or plot code matches <strong>{query}</strong>.
          </p>
          <p className="text-muted">Try the surname only, or ask the cemetery office.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      )}

      <div className="map-drag-hint">
        <span className="hint-pointer">
          {activeSection ? 'Drag to pan · scroll to zoom · Esc for overview' : 'Click a section number to open it · scroll to zoom'}
        </span>
        <span className="hint-touch">Drag to move · pinch to zoom</span>
      </div>
    </div>
  )
}
