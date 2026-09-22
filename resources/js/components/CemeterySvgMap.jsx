import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

export const STATUS_COLORS = {
  available: '#2f9e44',
  reserved: '#f59f00',
  occupied: '#c92a2a',
}

const SECTION_COLORS = ['#2c5530', '#1d4ed8', '#7c3aed', '#b45309', '#0e7490']

const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 ? parts : [...MAP_VIEWBOX]
}

function LotRect({ lot, selected, showLabel }) {
  const fill = STATUS_COLORS[lot.status] || '#868e96'
  return (
    <g data-lot-id={lot.lot_id} className={`lot-rect lot--${lot.status}${selected ? ' lot--selected' : ''}`}>
      <rect
        x={lot.svg_x}
        y={lot.svg_y}
        width={lot.svg_w}
        height={lot.svg_h}
        rx={2}
        fill={fill}
        stroke={selected ? '#111' : '#fff'}
        strokeWidth={selected ? 3 : 1}
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
}) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)
  const focusKey = activeSection ? activeSection.section_id : null

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
    flyTo(activeSection ? parseViewBox(activeSection.viewBox) : [...MAP_VIEWBOX])
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
    dragRef.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    const [x, y, w, h] = vbRef.current
    setVbBoth([x - (dx / rect.width) * w, y - (dy / rect.height) * h, w, h])
    dragRef.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e) => {
    dragRef.current = null
  }

  const onSvgClick = (e) => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    const lotEl = e.target.closest?.('[data-lot-id]')
    if (lotEl) {
      const lotId = Number(lotEl.getAttribute('data-lot-id'))
      const lot = activeSection?.lots?.find((l) => l.lot_id === lotId)
      if (lot) onSelectLot(lot)
      return
    }
    const secEl = e.target.closest?.('[data-section-id]')
    if (secEl && !activeSection) {
      const secId = Number(secEl.getAttribute('data-section-id'))
      const section = sections.find((s) => s.section_id === secId)
      if (section) onFocusSection(section)
    }
  }

  const zoomCenter = (factor) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  const showLabels = vb[2] < 1500
  const activeLots = activeSection?.lots || []

  return (
    <div className="map-svg-wrap">
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={vb.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
          <g className="map-sections">
            {sections.map((section, i) => {
              const [x, y, w, h] = parseViewBox(section.viewBox)
              const color = SECTION_COLORS[i % SECTION_COLORS.length]
              const total =
                (section.counts?.available || 0) + (section.counts?.reserved || 0) + (section.counts?.occupied || 0)
              return (
                <g key={section.section_id} data-section-id={section.section_id} className="map-section">
                  <rect x={x} y={y} width={w} height={h} rx={8} fill={color} opacity={0.12} stroke={color} strokeWidth={2} strokeDasharray="8 6" />
                  <g transform={`translate(${x + w / 2}, ${y + h / 2})`}>
                    <rect x={-85} y={-34} width={170} height={68} rx={8} fill="#fff" opacity={0.92} stroke={color} strokeWidth={2} />
                    <text textAnchor="middle" x={0} y={-8} className="map-section-title">{section.section_name}</text>
                    <text textAnchor="middle" x={0} y={16} className="map-section-meta">
                      {total} lots · {section.counts?.available || 0} available
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        ) : (
          <g className="map-lots">
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in">+</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out">−</button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => flyTo(activeSection ? parseViewBox(activeSection.viewBox) : [...MAP_VIEWBOX])}
          title="Fit view"
        >
          ⌂
        </button>
      </div>

      <div className="map-drag-hint">Drag to pan · scroll to zoom</div>
    </div>
  )
}