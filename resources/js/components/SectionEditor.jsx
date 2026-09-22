import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

// TEMP: admin overview section-vertex mapping editor. Drag section corners
// to align the A–E outlines to the traced layout. Save posts section
// viewBoxes. Remove this file plus the TEMP markers in Cemetery.jsx,
// app.css, SectionController.php and public/index.php once the layout
// is finalized.

const SNAP = 5
const GRID_STEP = 50
const MIN_SIZE = 60
const HANDLES = ['nw', 'ne', 'sw', 'se']
const SECTION_COLORS = ['#2c5530', '#1d4ed8', '#7c3aed', '#b45309', '#0e7490']

const snap = (v) => Math.round(v / SNAP) * SNAP

const parseVb = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 ? parts : [...MAP_VIEWBOX]
}

const vbString = (r) => `${r.x} ${r.y} ${r.w} ${r.h}`

export default function SectionEditor({ sections, onSaved, onCancel }) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const panRef = useRef(null)
  const movedRef = useRef(false)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)

  const [edits, setEdits] = useState(() =>
    Object.fromEntries(sections.map((s) => {
      const [x, y, w, h] = parseVb(s.viewBox)
      return [s.section_id, { x, y, w, h }]
    }))
  )
  const [selectedId, setSelectedId] = useState(null)
  const [drag, setDrag] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [minX, minY, mapW, mapH] = MAP_VIEWBOX
  const maxX = minX + mapW
  const maxY = minY + mapH

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
      const x = Math.max(minX, Math.min(maxX - r.w, r.x))
      const y = Math.max(minY, Math.min(maxY - r.h, r.y))
      return { x, y, w: Math.min(r.w, maxX - x), h: Math.min(r.h, maxY - y) }
    },
    [minX, minY, maxX, maxY]
  )

  const isDirty = useCallback(
    (sectionId) => {
      const s = sections.find((sec) => sec.section_id === sectionId)
      const ed = edits[sectionId]
      return !!s && !!ed && vbString(ed) !== String(s.viewBox || MAP_VIEWBOX.join(' '))
    },
    [sections, edits]
  )

  const dirtyCount = sections.filter((s) => isDirty(s.section_id)).length

  const startDrag = (e, sectionId, type, corner) => {
    if (saving) return
    e.stopPropagation()
    setDrag({ type, sectionId, corner, start: toSvg(e), orig: { ...edits[sectionId] } })
    setSelectedId(sectionId)
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onSvgPointerDown = (e) => {
    panRef.current = { x: e.clientX, y: e.clientY, vb: [...vbRef.current] }
    movedRef.current = false
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (drag && !saving) {
      const pt = toSvg(e)
      const dx = pt.x - drag.start.x
      const dy = pt.y - drag.start.y
      setEdits((prev) => {
        const o = drag.orig
        if (drag.type === 'move') {
          return {
            ...prev,
            [drag.sectionId]: clampRect({ ...o, x: snap(o.x + dx), y: snap(o.y + dy) }),
          }
        }
        let { x, y, w, h } = o
        if (drag.corner.includes('e')) w = Math.max(MIN_SIZE, snap(o.w + dx))
        if (drag.corner.includes('s')) h = Math.max(MIN_SIZE, snap(o.h + dy))
        if (drag.corner.includes('w')) {
          x = snap(o.x + dx)
          w = Math.max(MIN_SIZE, snap(o.w - dx))
        }
        if (drag.corner.includes('n')) {
          y = snap(o.y + dy)
          h = Math.max(MIN_SIZE, snap(o.h - dy))
        }
        return { ...prev, [drag.sectionId]: clampRect({ x, y, w, h }) }
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
    setDrag(null)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    const changed = sections
      .filter((s) => isDirty(s.section_id))
      .map((s) => ({ section_id: s.section_id, svg_viewbox: vbString(edits[s.section_id]) }))
    try {
      if (changed.length > 0) {
        const res = await api('/api/sections/viewboxes', { method: 'POST', body: { viewboxes: changed } })
        if (!res.ok) throw new Error(res.data?.error || 'Failed to save sections')
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
  const selectedSection = selectedId ? sections.find((s) => s.section_id === selectedId) : null

  const gridLines = []
  for (let x = Math.ceil(minX / GRID_STEP) * GRID_STEP; x <= maxX; x += GRID_STEP) {
    gridLines.push({ x1: x, y1: minY, x2: x, y2: maxY, k: `v${x}` })
  }
  for (let y = Math.ceil(minY / GRID_STEP) * GRID_STEP; y <= maxY; y += GRID_STEP) {
    gridLines.push({ x1: minX, y1: y, x2: maxX, y2: y, k: `h${y}` })
  }

  const handleSize = Math.max(10, Math.round(vb[2] / 70))

  return (
    <div className="section-editor">
      <div className="editor-toolbar">
        <span className="editor-title">
          Mapping sections <strong>A–E</strong> on the layout · {sections.length} sections
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

          <g className="map-trace" opacity={0.5} pointerEvents="none">
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

          {sections.map((sec, i) => {
            const ed = edits[sec.section_id]
            if (!ed) return null
            const color = SECTION_COLORS[i % SECTION_COLORS.length]
            const isSel = sec.section_id === selectedId
            const dirty = isDirty(sec.section_id)
            return (
              <g key={sec.section_id}>
                <rect
                  className="editor-section"
                  x={ed.x}
                  y={ed.y}
                  width={ed.w}
                  height={ed.h}
                  rx={6}
                  fill={color}
                  opacity={0.12}
                  stroke={color}
                  strokeWidth={isSel ? 3 : 2}
                  strokeDasharray={dirty ? '8 5' : '8 6'}
                  onPointerDown={(e) => startDrag(e, sec.section_id, 'move')}
                  style={{ cursor: 'move' }}
                >
                  <title>{`${sec.section_name} · ${vbString(ed)}`}</title>
                </rect>

                <text
                  x={ed.x + ed.w / 2}
                  y={ed.y + ed.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="editor-section-label"
                  pointerEvents="none"
                >
                  {sec.section_name}
                </text>

                {HANDLES.map((corner) => {
                  const cx = corner.includes('w') ? ed.x : ed.x + ed.w
                  const cy = corner.includes('n') ? ed.y : ed.y + ed.h
                  return (
                    <rect
                      key={corner}
                      className="editor-handle"
                      x={cx - handleSize / 2}
                      y={cy - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      rx={2}
                      fill={isSel ? '#fff' : color}
                      stroke={isSel ? '#111' : '#fff'}
                      strokeWidth={1.5}
                      onPointerDown={(e) => startDrag(e, sec.section_id, 'resize', corner)}
                      style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>

        <div className="map-zoom-controls">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in">+</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out">−</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => flyTo([...MAP_VIEWBOX])} title="Fit view">⌂</button>
        </div>

        <div className="map-drag-hint">Drag corners to reshape · drag a section to move it · drag empty space to pan · scroll to zoom</div>
      </div>

      <p className="editor-hint">
        Drag the corner handles to map each section outline onto the layout
        {selected && selectedSection && (
          <span className="editor-coords">
            {' · '}
            {selectedSection.section_name} = {vbString(selected)}
            {isDirty(selectedId) && ' (unsaved)'}
          </span>
        )}
      </p>
    </div>
  )
}