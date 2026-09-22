import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'
import { STATUS_COLORS } from './CemeterySvgMap'

// TEMP: whole-map layout editor for seeding lot grid positions (admin only).
// Remove this file plus the TEMP markers in Cemetery.jsx and app.css once
// the lot grid is finalized.

const SNAP = 5
const GRID_STEP = 50
const MIN_SIZE = SNAP * 2
const PAD = 150
const HANDLES = ['nw', 'ne', 'sw', 'se']

const snap = (v) => Math.round(v / SNAP) * SNAP

export default function LotEditor({ lots, onSaved, onCancel }) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const panRef = useRef(null)
  const movedRef = useRef(false)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)

  const [edits, setEdits] = useState(() =>
    Object.fromEntries(
      lots.map((l) => [l.lot_id, { svg_x: l.svg_x, svg_y: l.svg_y, svg_w: l.svg_w, svg_h: l.svg_h }])
    )
  )
  const [selectedId, setSelectedId] = useState(null)
  const [lotDrag, setLotDrag] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [minX, minY, maxX, maxY] = useMemo(
    () => [MAP_VIEWBOX[0] - PAD, MAP_VIEWBOX[1] - PAD, MAP_VIEWBOX[0] + MAP_VIEWBOX[2] + PAD, MAP_VIEWBOX[1] + MAP_VIEWBOX[3] + PAD],
    []
  )

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

  const zoomAt = useCallback(
    (px, py, factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [x, y, w, h] = vbRef.current
      const ux = (px / rect.width) * w + x
      const uy = (py / rect.height) * h + y
      const nw = Math.min(4000, Math.max(150, w / factor))
      const nh = (nw / w) * h
      setVbBoth([ux - (px / rect.width) * nw, uy - (py / rect.height) * nh, nw, nh])
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

  const zoomCenter = (factor) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  const toSvg = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const [x, y, w, h] = vbRef.current
    const scale = Math.min(rect.width / w, rect.height / h)
    const ox = (rect.width - w * scale) / 2
    const oy = (rect.height - h * scale) / 2
    return {
      x: x + (e.clientX - rect.left - ox) / scale,
      y: y + (e.clientY - rect.top - oy) / scale,
    }
  }, [])

  const clampRect = useCallback(
    (r) => {
      const x = Math.max(minX, Math.min(maxX - r.svg_w, r.svg_x))
      const y = Math.max(minY, Math.min(maxY - r.svg_h, r.svg_y))
      return {
        svg_x: x,
        svg_y: y,
        svg_w: Math.min(r.svg_w, maxX - x),
        svg_h: Math.min(r.svg_h, maxY - y),
      }
    },
    [minX, minY, maxX, maxY]
  )

  const isDirty = useCallback(
    (lotId) => {
      const lot = lots.find((l) => l.lot_id === lotId)
      const ed = edits[lotId]
      return (
        !!lot &&
        !!ed &&
        (ed.svg_x !== lot.svg_x || ed.svg_y !== lot.svg_y || ed.svg_w !== lot.svg_w || ed.svg_h !== lot.svg_h)
      )
    },
    [lots, edits]
  )

  const dirtyCount = lots.filter((l) => isDirty(l.lot_id)).length

  const startLotDrag = (e, lotId, type, handle) => {
    if (saving) return
    e.stopPropagation()
    setLotDrag({ type, lotId, handle, start: toSvg(e), orig: { ...edits[lotId] } })
    setSelectedId(lotId)
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onSvgPointerDown = (e) => {
    panRef.current = { x: e.clientX, y: e.clientY, vb: [...vbRef.current] }
    movedRef.current = false
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (lotDrag && !saving) {
      const pt = toSvg(e)
      const dx = pt.x - lotDrag.start.x
      const dy = pt.y - lotDrag.start.y
      setEdits((prev) => {
        const o = lotDrag.orig
        if (lotDrag.type === 'move') {
          return {
            ...prev,
            [lotDrag.lotId]: clampRect({ ...o, svg_x: snap(o.svg_x + dx), svg_y: snap(o.svg_y + dy) }),
          }
        }
        let { svg_x: x, svg_y: y, svg_w: w, svg_h: h } = o
        if (lotDrag.handle.includes('e')) w = Math.max(MIN_SIZE, snap(o.svg_w + dx))
        if (lotDrag.handle.includes('s')) h = Math.max(MIN_SIZE, snap(o.svg_h + dy))
        if (lotDrag.handle.includes('w')) {
          x = snap(o.svg_x + dx)
          w = Math.max(MIN_SIZE, snap(o.svg_w - dx))
        }
        if (lotDrag.handle.includes('n')) {
          y = snap(o.svg_y + dy)
          h = Math.max(MIN_SIZE, snap(o.svg_h - dy))
        }
        return { ...prev, [lotDrag.lotId]: clampRect({ svg_x: x, svg_y: y, svg_w: w, svg_h: h }) }
      })
      return
    }

    if (panRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const dx = e.clientX - panRef.current.x
      const dy = e.clientY - panRef.current.y
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
      const [x, y, w, h] = panRef.current.vb
      setVbBoth([x - (dx / rect.width) * w, y - (dy / rect.height) * h, w, h])
    }
  }

  const onPointerUp = () => {
    if (panRef.current && !movedRef.current) setSelectedId(null)
    panRef.current = null
    setLotDrag(null)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    const changed = lots.filter((l) => isDirty(l.lot_id))
    try {
      for (const lot of changed) {
        const res = await api(`/api/lots/${lot.lot_id}`, { method: 'POST', body: edits[lot.lot_id] })
        if (!res.ok) throw new Error(res.data?.error || `Failed to save ${lot.lot_code}`)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    if (dirtyCount > 0 && !window.confirm(`Discard ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}?`)) return
    onCancel()
  }

  const selected = selectedId ? edits[selectedId] : null
  const selectedLot = selectedId ? lots.find((l) => l.lot_id === selectedId) : null

  const gridLines = []
  for (let x = Math.ceil(minX / GRID_STEP) * GRID_STEP; x <= maxX; x += GRID_STEP) {
    gridLines.push({ x1: x, y1: minY, x2: x, y2: maxY, k: `v${x}` })
  }
  for (let y = Math.ceil(minY / GRID_STEP) * GRID_STEP; y <= maxY; y += GRID_STEP) {
    gridLines.push({ x1: minX, y1: y, x2: maxX, y2: y, k: `h${y}` })
  }

  const showLabels = vb[2] < 1500
  const handleSize = Math.max(10, Math.round(vb[2] / 70))

  return (
    <div className="lot-editor">
      <div className="editor-toolbar">
        <span className="editor-title">
          Editing <strong>whole map</strong> · {lots.length} lots
          {dirtyCount > 0 && <span className="editor-dirty">{dirtyCount} unsaved</span>}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={saving || dirtyCount === 0}
          >
            {saving ? 'Saving…' : `Save Changes${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="map-svg-wrap">
        <svg
          ref={svgRef}
          className="map-svg editor-svg"
          viewBox={vb.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none' }}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} fill="#f4f1e8" />

          <g className="map-trace" opacity={0.45} pointerEvents="none">
            {TRACE_PATHS.map((d, i) => (
              <path key={i} d={d} fill="#e9dcb8" stroke="#3E6B4C" strokeWidth={6} strokeLinejoin="round" />
            ))}
            <circle cx={TRACE_CIRCLE.cx} cy={TRACE_CIRCLE.cy} r={TRACE_CIRCLE.r} fill="#e9dcb8" stroke="#3E6B4C" strokeWidth={6} />
          </g>

          <g className="editor-grid" pointerEvents="none">
            {gridLines.map((l) => (
              <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#94a3b8" strokeWidth={0.6} opacity={0.4} />
            ))}
          </g>

          {lots.map((lot) => {
            const ed = edits[lot.lot_id]
            if (!ed) return null
            const isSel = lot.lot_id === selectedId
            return (
              <g
                key={lot.lot_id}
                className="editor-lot"
                onPointerDown={(e) => startLotDrag(e, lot.lot_id, 'move')}
                style={{ cursor: 'move' }}
              >
                <rect
                  x={ed.svg_x}
                  y={ed.svg_y}
                  width={ed.svg_w}
                  height={ed.svg_h}
                  rx={2}
                  fill={STATUS_COLORS[lot.status] || '#868e96'}
                  stroke={isSel ? '#111' : 'rgba(255,255,255,0.9)'}
                  strokeWidth={isSel ? 3 : 1}
                  strokeDasharray={isDirty(lot.lot_id) ? '5 3' : undefined}
                  opacity={isSel ? 0.95 : 0.85}
                />
                {showLabels && (
                  <text
                    x={ed.svg_x + ed.svg_w / 2}
                    y={ed.svg_y + ed.svg_h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="lot-label editor-lot-label"
                    pointerEvents="none"
                  >
                    {lot.lot_code}
                  </text>
                )}
                <title>{`${lot.lot_code} · ${lot.status}`}</title>
              </g>
            )
          })}

          {selected &&
            HANDLES.map((h) => {
              const cx = h.includes('w') ? selected.svg_x : selected.svg_x + selected.svg_w
              const cy = h.includes('n') ? selected.svg_y : selected.svg_y + selected.svg_h
              return (
                <rect
                  key={h}
                  className="editor-handle"
                  x={cx - handleSize / 2}
                  y={cy - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  rx={2}
                  fill="#fff"
                  stroke="#111"
                  strokeWidth={1.5}
                  onPointerDown={(e) => startLotDrag(e, selectedId, 'resize', h)}
                  style={{ cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                />
              )
            })}
        </svg>

        <div className="map-zoom-controls">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in">+</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out">−</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => flyTo([...MAP_VIEWBOX])} title="Fit view">⌂</button>
        </div>

        <div className="map-drag-hint">Drag lot to move · corner handles to resize · drag empty space to pan · scroll to zoom</div>
      </div>

      <p className="editor-hint">
        Click a lot to select it, then drag corner handles to resize
        {selected && selectedLot && (
          <span className="editor-coords">
            {' · '}
            {selectedLot.lot_code} @ {Math.round(selected.svg_x)},{Math.round(selected.svg_y)} ·{' '}
            {selected.svg_w}×{selected.svg_h}
          </span>
        )}
      </p>
    </div>
  )
}