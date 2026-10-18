import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAP_VIEWBOX } from '../map/tracePaths'
import PlanImage, { levelFor } from '../map/PlanImage'

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
const MAX_VIEW = 4500
const MIN_FRAME = 300
const MIN_ZOOM = 250

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
const frame = (bounds, aspect, within = null) => {
  const [x0, y0, x1, y1] = bounds
  const padding = Math.max(x1 - x0, y1 - y0) * 0.04
  const width = Math.max(x1 - x0, 1) + padding * 2
  const height = Math.max(y1 - y0, 1) + padding * 2

  const viewWidth = Math.min(MAX_VIEW, Math.max(MIN_FRAME, Math.max(width, height * aspect)))
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

function LotRect({ lot, selected, labelScale, dimmed, faded }) {
  const fill = STATUS_COLORS[lot.status] || 'var(--color-text-muted)'
  // One <rect> per plot rather than a <g> wrapper: the map draws every plot at
  // every zoom, so ~3,890 wrappers (and their <title> tooltips) were pure DOM
  // weight. The click handler targets data-lot-id via closest(), and the state
  // classes live on the rect, which the stylesheet already anticipates
  // (rect.lot--selected). Per-plot detail is on the click-through pane, not a
  // hover tooltip.
  return (
    <>
      <rect
        data-lot-id={lot.lot_id}
        className={`lot-rect lot--${lot.status}${selected ? ' lot--selected' : ''}${dimmed ? ' lot--dimmed' : ''}${faded ? ' lot--faded' : ''}`}
        x={lot.svg_x}
        y={lot.svg_y}
        width={lot.svg_w}
        height={lot.svg_h}
        rx={2}
        style={{ fill }}
        stroke="#fff"
        strokeWidth={1}
        // Keeps the hairline between neighbouring plots from thinning to
        // nothing when the whole cemetery is scaled into the overview.
        vectorEffect="non-scaling-stroke"
        strokeDasharray={lot.status === 'reserved' ? '5 4' : undefined}
      />
      {labelScale > 0 && (
        <text
          x={lot.svg_x + lot.svg_w / 2}
          y={lot.svg_y + lot.svg_h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="lot-label"
          // Plot labels have the same problem as section titles: SVG text is in
          // user units, so a size that reads in a section fills the plot when
          // the map is zoomed further. Scaling by the current viewBox keeps
          // every label the same height on screen at every zoom.
          style={{ fontSize: `${labelScale}px`, strokeWidth: labelScale * 0.18 }}
          pointerEvents="none"
        >
          {lot.lot_code}
        </text>
      )}
    </>
  )
}

const MemoLotRect = memo(LotRect)

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

  const allLots = useMemo(() => sections.flatMap((s) => s.lots || []), [sections])

  // A search frames its matches closely enough that whatever the frame opens up
  // has to be there — otherwise ten plots float in an empty box with no way to
  // tell which part of the site they are in. The plots a search filtered out
  // come back as context, faded.
  const fadedLots = useMemo(() => {
    if (!query) return []
    const matched = new Set(allLots.map((l) => l.lot_id))
    return (contextLots || []).filter((l) => !matched.has(l.lot_id))
  }, [query, allLots, contextLots])

  const siteBounds = useMemo(() => {
    // Over the plots, not over the sections: a section's viewBox is a full-width
    // band across the sheet, so taking the union of those frames the entire
    // scan including its paper margins and title block, and the plan then sits
    // small in the middle of the pane. The plots are where the cemetery is.
    const plots = lotsBounds(allLots)
    return plots || sections.reduce((acc, s) => unionRect(acc, sectionBounds(s)), null) || [...MAP_VIEWBOX]
  }, [sections, allLots])

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

  const setVbBoth = useCallback((next) => {
    vbRef.current = next
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
      const t0 = performance.now()
      const dur = 450
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur)
        const e = 1 - Math.pow(1 - k, 3)
        setVbBoth(start.map((s, i) => s + (target[i] - s) * e))
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
        ? frame(focusBounds || siteBounds, aspect || DEFAULT_ASPECT, siteBounds)
        : [...MAP_VIEWBOX]
      userAdjustedRef.current = false
      if (!animate || aspect === 0 || prefersReducedMotion()) setVbBoth(target)
      else flyTo(target)
    },
    [fillPane, focusBounds, siteBounds, aspect, setVbBoth, flyTo]
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

  const zoomAt = useCallback(
    (px, py, factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [x, y, w, h] = vbRef.current
      const ux = (px / rect.width) * w + x
      const uy = (py / rect.height) * h + y
      const nw = Math.min(MAX_VIEW, Math.max(MIN_ZOOM, w / factor))
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

  const onPointerMove = (e) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

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
      const nw = Math.min(MAX_VIEW, Math.max(MIN_ZOOM, w / factor))
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

  // CSS pixels per SVG user unit. SVG text is sized in user units, so a value
  // that reads at one zoom fills the screen at another; dividing the target
  // rendered size by this keeps titles and plot labels the same size on screen
  // however far in the map is.
  const pxPerUnit = pane.width > 0 ? pane.width / vb[2] : 0
  const fit = (targetPx) => (pxPerUnit > 0 ? targetPx / pxPerUnit : 0)
  const titleSize = fit(12)
  const labelSize = vb[2] < 1500 ? fit(10) : 0
  const noMatches = Boolean(query) && allLots.length === 0

  return (
    <div className="map-svg-wrap">
      <svg
        ref={svgRef}
        className="map-svg"
        data-map-level={activeSection ? 'section-detail' : 'overview'}
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
        onClick={onSvgClick}
      >
        <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} fill="#f4f1e8" />

        <PlanImage level={levelFor(pane.width > 0 ? vb[2] / pane.width : MAP_VIEWBOX[2])} />

        {/* Section outlines underneath, plots over them, titles on top. The
            survey plan already draws each row of plots, so only the open section
            is outlined — 66 stacked band outlines over the plan read as noise. */}
        <g className="map-sections">
          {sections.map((section) => {
            const [x, y, w, h] = parseViewBox(section.viewBox)
            const points = section.points
            const color = sectionColor(section.section_id)
            if (section.section_id !== activeSectionId) return null
            return points ? (
              <polygon
                key={section.section_id}
                data-section-id={section.section_id}
                className="map-outline map-outline--active"
                points={points}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={4}
                strokeLinejoin="round"
              />
            ) : (
              <rect
                key={section.section_id}
                data-section-id={section.section_id}
                className="map-outline map-outline--active"
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={4}
              />
            )
          })}
        </g>

        {/* Every section's plots at every zoom. Cropping to one section is what
            left the frame around it empty; drawing the neighbours instead fills
            it, and the plot you came for grows to twice its overview size. */}
        <g className="map-lots">
          {fadedLots.map((lot) => (
            <MemoLotRect key={lot.lot_id} lot={lot} selected={false} labelScale={0} dimmed faded />
          ))}
          {/* Labels are drawn in a second pass so the active section's sit on
              top of its neighbours' rather than being buried by them. */}
          {allLots
            .filter((lot) => activeSectionId === null || lot.section_id === activeSectionId)
            .map((lot) => (
              <MemoLotRect
                key={lot.lot_id}
                lot={lot}
                selected={lot.lot_id === selectedLotId}
                labelScale={labelSize}
              />
            ))}
          {/* Neighbours are here for context only: faded, and without labels —
              two hundred plot codes from the next section along read as noise
              over the one you came for. */}
          {allLots
            .filter((lot) => activeSectionId !== null && lot.section_id !== activeSectionId)
            .map((lot) => (
              <MemoLotRect key={lot.lot_id} lot={lot} selected={false} labelScale={0} dimmed />
            ))}
        </g>

        <g className="map-sections">
          {sections.map((section) => {
            // The plan has its section numbers printed on it, so a title is
            // only useful for the section actually open; 66 of them at once
            // just pile up in the middle of the site.
            if (section.section_id !== activeSectionId) return null
            const [x, y, w, h] = parseViewBox(section.viewBox)
            const [minX, minY, maxX, maxY] = pointsBounds(section.points, [x, y, x + w, y + h])
            return (
              <text
                key={section.section_id}
                x={(minX + maxX) / 2}
                y={(minY + maxY) / 2}
                textAnchor="middle"
                dominantBaseline="central"
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

      <div className="map-zoom-controls">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in" aria-label="Zoom in">+</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out" aria-label="Zoom out">−</button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={fitView}
          title="Fit view"
          aria-label="Fit view"
        >
          ⌂
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setFillPane((v) => !v)}
          aria-pressed={fillPane}
          aria-label="Fill pane with the plan"
          title={fillPane ? 'Showing the pane filled — click for the whole sheet' : 'Showing the whole sheet — click to fill the pane'}
        >
          {fillPane ? 'Fill' : 'Fit'}
        </button>
      </div>

      {noMatches && (
        <div className="map-empty">
          <p>
            No plot matches <strong>{query}</strong>.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      )}

      <div className="map-drag-hint">
        Drag to pan · scroll to zoom{activeSection && ' · Esc for overview'}
      </div>
    </div>
  )
}
