import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

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

// The outline is stored in site coordinates, the section detail view rebases
// plots against the section's own origin, so shift the outline to match.
const localPoints = (points, dx, dy) => {
  const values = String(points || '').trim().split(/\s+/).map(Number)
  if (values.length < 6 || values.some((v) => !Number.isFinite(v))) return null
  const out = []
  for (let i = 0; i + 1 < values.length; i += 2) {
    out.push(`${values[i] - dx} ${values[i + 1] - dy}`)
  }
  return out.join(' ')
}

const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 ? parts : [...MAP_VIEWBOX]
}

const sectionPoints = (section) => section.points || null

const pointsBounds = (points, fallback) => {
  const values = String(points || '').split(/[ ,]+/).map(Number).filter(Number.isFinite)
  if (values.length < 6 || values.length % 2 !== 0) return fallback
  const xs = values.filter((_, index) => index % 2 === 0)
  const ys = values.filter((_, index) => index % 2 === 1)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function LotRect({ lot, selected, showLabel }) {
  const fill = STATUS_COLORS[lot.status] || 'var(--color-text-muted)'
  return (
    <g data-lot-id={lot.lot_id} className={`lot-rect lot--${lot.status}${selected ? ' lot--selected' : ''}`}>
      <rect
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
      {showLabel && (
        <text
          x={lot.svg_x + lot.svg_w / 2}
          y={lot.svg_y + lot.svg_h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="lot-label"
          pointerEvents="none"
        >
          {lot.lot_code}
        </text>
      )}
      <title>{`${lot.lot_code} · ${lot.status} · ₱${Number(lot.price || 0).toLocaleString()}`}</title>
    </g>
  )
}

const MemoLotRect = memo(LotRect)

export default function CemeterySvgMap({
  sections,
  activeSection,
  selectedLotId,
  showLayout,
  onSelectLot,
  onFocusSection,
  onExitSection,
}) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)
  const focusKey = activeSection ? activeSection.section_id : null
  const detailViewBox = activeSection
    ? (() => {
        const [, , width, height] = parseViewBox(activeSection.viewBox)
        return [0, 0, width, height]
      })()
    : null
  const fitViewBox = detailViewBox || [...MAP_VIEWBOX]

  const setVbBoth = useCallback((next) => {
    vbRef.current = next
    setVb(next)
  }, [])

  const flyTo = useCallback(
    (target) => {
      cancelAnimationFrame(rafRef.current)
      const start = vbRef.current
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

  useEffect(() => {
    flyTo(fitViewBox)
  }, [focusKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback(
    (px, py, factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [x, y, w, h] = vbRef.current
      const ux = (px / rect.width) * w + x
      const uy = (py / rect.height) * h + y
      const nw = Math.min(2500, Math.max(120, w / factor))
      const nh = (nw / w) * h
      const nx = ux - (px / rect.width) * nw
      const ny = uy - (py / rect.height) * nh
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
      const nw = Math.min(2500, Math.max(120, w / factor))
      const nh = (nw / w) * h
      const px = (start.cx - rect.left) / rect.width
      const py = (start.cy - rect.top) / rect.height
      const nx = x + px * w - px * nw
      const ny = y + py * h - py * nh
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
      // The overview draws every plot now, so a click there resolves against
      // all sections; the detail view only has the open section's to choose from.
      const pool = activeSection ? activeSection.lots || [] : sections.flatMap((s) => s.lots || [])
      const lot = pool.find((l) => l.lot_id === lotId)
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

  const showLabels = vb[2] < 1500
  const [activeX, activeY] = activeSection ? parseViewBox(activeSection.viewBox) : [0, 0]
  const activeLots = (activeSection?.lots || []).map((lot) => ({
    ...lot,
    svg_x: lot.svg_x - activeX,
    svg_y: lot.svg_y - activeY,
  }))
  const activeOutline = activeSection ? localPoints(activeSection.points, activeX, activeY) : null

  // In the overview the plots are already in site coordinates, so they need no
  // rebasing -- only the detail view shifts them against the section origin.
  // Without these the legend counted 305 plots the overview never drew.
  const overviewLots = activeSection ? [] : sections.flatMap((s) => s.lots || [])

  return (
    <div className="map-svg-wrap">
      <svg
        ref={svgRef}
        key={activeSection ? `detail-${activeSection.section_id}` : 'overview'}
        className="map-svg"
        data-map-level={activeSection ? 'section-detail' : 'overview'}
        aria-label={activeSection ? `${activeSection.section_name} detailed lot map` : 'Cemetery overview map, every plot coloured by status'}
        viewBox={vb.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onSvgClick}
      >
        <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} fill="#f4f1e8" />

        {showLayout && (
          <g className="map-trace" opacity={0.45}>
            {TRACE_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="#e9dcb8"
                stroke="#3E6B4C"
                strokeWidth={6}
                strokeLinejoin="round"
              />
            ))}
            <circle cx={TRACE_CIRCLE.cx} cy={TRACE_CIRCLE.cy} r={TRACE_CIRCLE.r} fill="#e9dcb8" stroke="#3E6B4C" strokeWidth={6} />
          </g>
        )}

        {!activeSection ? (
          <>
            {/* Three passes, and the order matters: outlines underneath, plots
                over them, labels on top. The section wash used to carry the
                colour and had nowhere to hide; the plots do now, so it drops to
                a stroke. The labels have to come last or 305 rectangles bury
                them. */}
            <g className="map-sections">
              {sections.map((section) => {
                const [x, y, w, h] = parseViewBox(section.viewBox)
                const points = sectionPoints(section)
                const color = sectionColor(section.section_id)
                return points ? (
                  <polygon
                    key={section.section_id}
                    data-section-id={section.section_id}
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeDasharray="12 8"
                  />
                ) : (
                  <rect
                    key={section.section_id}
                    data-section-id={section.section_id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="8 6"
                  />
                )
              })}
            </g>

            <g className="map-lots">
              {overviewLots.map((lot) => (
                <MemoLotRect
                  key={lot.lot_id}
                  lot={lot}
                  selected={lot.lot_id === selectedLotId}
                  showLabel={showLabels}
                />
              ))}
            </g>

            <g className="map-sections">
              {sections.map((section) => {
                const [x, y, w, h] = parseViewBox(section.viewBox)
                const points = sectionPoints(section)
                const [minX, minY, maxX, maxY] = pointsBounds(points, [x, y, x + w, y + h])
                return (
                  <text
                    key={section.section_id}
                    x={(minX + maxX) / 2}
                    y={(minY + maxY) / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="map-section-title map-overview-title"
                    paintOrder="stroke"
                    stroke="#ffffff"
                    strokeWidth={10}
                    strokeLinejoin="round"
                  >
                    {section.section_name}
                  </text>
                )
              })}
            </g>
          </>
        ) : (
          <g className="map-lots">
            {activeOutline && (
              <polygon
                points={activeOutline}
                fill={sectionColor(activeSection.section_id)}
                fillOpacity={0.1}
                stroke={sectionColor(activeSection.section_id)}
                strokeWidth={3}
                strokeDasharray="12 8"
                strokeLinejoin="round"
              />
            )}
            {activeLots.map((lot) => (
              <MemoLotRect
                key={lot.lot_id}
                lot={lot}
                selected={lot.lot_id === selectedLotId}
                showLabel={showLabels}
              />
            ))}
          </g>
        )}
      </svg>

      <div className="map-zoom-controls">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in" aria-label="Zoom in">+</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out" aria-label="Zoom out">−</button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => flyTo(fitViewBox)}
          title="Fit view"
          aria-label="Fit view"
        >
          ⌂
        </button>
      </div>

      <div className="map-drag-hint">
        Drag to pan · scroll to zoom{activeSection && ' · Esc for overview'}
      </div>
    </div>
  )
}