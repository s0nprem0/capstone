import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

// TEMP: admin overview section-vertex mapping editor (free-form polygons).
// Drag vertices to reshape a section, drag an edge "+" to add a vertex,
// double-click a vertex to remove it (min 4), drag the body to move it.
// Save posts section svg_points; the backend syncs svg_viewbox to the
// bounding box. Remove this file plus the TEMP markers in Cemetery.jsx,
// app.css, SectionController.php and public/index.php once the layout
// is finalized.

const SNAP = 5
const GRID_STEP = 50
const MIN_VERTICES = 4
const [MAP_MIN_X, MAP_MIN_Y, MAP_W, MAP_H] = MAP_VIEWBOX
const MAP_MAX_X = MAP_MIN_X + MAP_W
const MAP_MAX_Y = MAP_MIN_Y + MAP_H
const SECTION_COLORS = ['#2c5530', '#1d4ed8', '#7c3aed', '#b45309', '#0e7490']

const snap = (v) => Math.round(v / SNAP) * SNAP

const clampP = (p) => ({
  x: Math.max(MAP_MIN_X, Math.min(MAP_MAX_X, p.x)),
  y: Math.max(MAP_MIN_Y, Math.min(MAP_MAX_Y, p.y)),
})

const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 ? parts : [...MAP_VIEWBOX]
}

const strToPts = (s) => {
  const first = String(s || '').trim()
  if (!first) return null
  const tokens = first.split(/\s+/).map(Number)
  if (tokens.length < 8 || tokens.length % 2 !== 0) return null
  const pts = []
  for (let i = 0; i < tokens.length; i += 2) pts.push({ x: tokens[i], y: tokens[i + 1] })
  return pts
}

const ptsToStr = (pts) => pts.map((p) => `${Math.round(p.x)} ${Math.round(p.y)}`).join(' ')

const bboxOf = (pts) => {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

const initialPts = (section) => strToPts(section.points) || (() => {
  const [x, y, w, h] = parseViewBox(section.viewBox)
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
})()

export default function SectionEditor({ sections, onSaved, onCancel }) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const panRef = useRef(null)
  const movedRef = useRef(false)
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const vbRef = useRef(vb)

  const [edits, setEdits] = useState(() =>
    Object.fromEntries(sections.map((s) => [s.section_id, initialPts(s)]))
  )
  const [selectedId, setSelectedId] = useState(null)
  const [selectedVertex, setSelectedVertex] = useState(null)
  const [drag, setDrag] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  // Arrow-key nudge of the selected vertex while the editor is open.
  useEffect(() => {
    const onKey = (e) => {
      if (selectedId == null || selectedVertex == null) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]
      if (!dir) return
      e.preventDefault()
      setEdits((prev) => {
        const pts = prev[selectedId].map((p) => ({ ...p }))
        pts[selectedVertex] = clampP({
          x: snap(pts[selectedVertex].x + dir[0] * SNAP),
          y: snap(pts[selectedVertex].y + dir[1] * SNAP),
        })
        return { ...prev, [selectedId]: pts }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectedVertex])

  const isDirty = useCallback(
    (sectionId) => {
      const s = sections.find((sec) => sec.section_id === sectionId)
      const pts = edits[sectionId]
      if (!s || !pts) return false
      const orig = strToPts(s.points) || initialPts(s)
      return ptsToStr(pts) !== ptsToStr(orig)
    },
    [sections, edits]
  )

  const dirtyCount = sections.filter((s) => isDirty(s.section_id)).length

  const startDrag = (e, sectionId, type, index) => {
    if (saving) return
    e.stopPropagation()
    const pt = toSvg(e)
    if (type === 'add') {
      // index = insertion point; the new vertex starts at the edge midpoint.
      const pts = edits[sectionId]
      const a = pts[(index - 1 + pts.length) % pts.length]
      const b = pts[index % pts.length]
      const mid = clampP({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      setDrag({ type, sectionId, index, start: pt, vertex: mid, orig: pts })
      setSelectedId(sectionId)
      setSelectedVertex(index)
    } else {
      setDrag({ type, sectionId, index: type === 'vertex' ? index : null, start: pt, orig: edits[sectionId] })
      setSelectedId(sectionId)
      if (type === 'vertex') setSelectedVertex(index)
    }
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
      const cur = clampP({ x: snap(pt.x), y: snap(pt.y) })
      setEdits((prev) => {
        if (drag.type === 'vertex') {
          const pts = drag.orig.map((p) => ({ ...p }))
          pts[drag.index] = cur
          return { ...prev, [drag.sectionId]: pts }
        }
        if (drag.type === 'add') {
          const pts = [...drag.orig.slice(0, drag.index), cur, ...drag.orig.slice(drag.index)]
          return { ...prev, [drag.sectionId]: pts }
        }
        // move whole polygon: shift all vertices, clamped so the bbox stays in map bounds
        const dx = snap(pt.x - drag.start.x)
        const dy = snap(pt.y - drag.start.y)
        const bbox = bboxOf(drag.orig)
        const sx = Math.max(-bbox.x, Math.min(MAP_W - bbox.w, dx))
        const sy = Math.max(-bbox.y, Math.min(MAP_H - bbox.h, dy))
        if (sx === 0 && sy === 0) return prev
        return {
          ...prev,
          [drag.sectionId]: drag.orig.map((p) => ({ x: p.x + sx, y: p.y + sy })),
        }
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

  const deleteVertex = (e, sectionId, index) => {
    e.stopPropagation()
    setEdits((prev) => {
      const pts = prev[sectionId]
      if (pts.length <= MIN_VERTICES) return prev
      const next = pts.filter((_, i) => i !== index)
      if (selectedVertex === index) setSelectedVertex(null)
      return { ...prev, [sectionId]: next }
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    const changed = sections
      .filter((s) => isDirty(s.section_id))
      .map((s) => ({ section_id: s.section_id, svg_points: ptsToStr(edits[s.section_id]) }))
    try {
      if (changed.length > 0) {
        const res = await api('/api/sections/polygons', { method: 'POST', body: { polygons: changed } })
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
  for (let x = Math.ceil(MAP_MIN_X / GRID_STEP) * GRID_STEP; x <= MAP_MAX_X; x += GRID_STEP) {
    gridLines.push({ x1: x, y1: MAP_MIN_Y, x2: x, y2: MAP_MAX_Y, k: `v${x}` })
  }
  for (let y = Math.ceil(MAP_MIN_Y / GRID_STEP) * GRID_STEP; y <= MAP_MAX_Y; y += GRID_STEP) {
    gridLines.push({ x1: MAP_MIN_X, y1: y, x2: MAP_MAX_X, y2: y, k: `h${y}` })
  }

  const handleSize = Math.max(10, Math.round(vb[2] / 70))
  const addHandleSize = Math.max(8, Math.round(vb[2] / 90))

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
            const pts = edits[sec.section_id]
            if (!pts) return null
            const color = SECTION_COLORS[i % SECTION_COLORS.length]
            const isSel = sec.section_id === selectedId
            const bbox = bboxOf(pts)
            const dirty = isDirty(sec.section_id)
            return (
              <g key={sec.section_id}>
                <polygon
                  className="editor-section"
                  points={ptsToStr(pts)}
                  fill={color}
                  opacity={isSel ? 0.16 : 0.1}
                  stroke={color}
                  strokeWidth={isSel ? 3 : 2}
                  strokeDasharray={dirty ? '8 5' : undefined}
                  strokeLinejoin="round"
                  onPointerDown={(e) => startDrag(e, sec.section_id, 'move')}
                  style={{ cursor: 'move' }}
                >
                  <title>{`${sec.section_name} · ${pts.length} vertices · bbox ${Math.round(bbox.x)} ${Math.round(bbox.y)} ${Math.round(bbox.w)} ${Math.round(bbox.h)}`}</title>
                </polygon>

                <text
                  x={bbox.x + bbox.w / 2}
                  y={bbox.y + bbox.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="editor-section-label"
                  pointerEvents="none"
                >
                  {sec.section_name}
                </text>

                {pts.map((p, vi) => {
                  const vSel = isSel && selectedVertex === vi
                  return (
                    <rect
                      key={`v${vi}`}
                      className="editor-vertex"
                      x={p.x - handleSize / 2}
                      y={p.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      rx={2}
                      fill={vSel ? '#fff' : color}
                      stroke={vSel ? '#111' : '#fff'}
                      strokeWidth={1.5}
                      opacity={isSel ? 1 : 0.7}
                      onPointerDown={(e) => startDrag(e, sec.section_id, 'vertex', vi)}
                      onDoubleClick={(e) => deleteVertex(e, sec.section_id, vi)}
                      style={{ cursor: 'move' }}
                    >
                      <title>{`Vertex ${vi + 1} · double-click to remove`}</title>
                    </rect>
                  )
                })}

                {isSel &&
                  pts.map((p, vi) => {
                    const a = pts[vi]
                    const b = pts[(vi + 1) % pts.length]
                    const midX = (a.x + b.x) / 2
                    const midY = (a.y + b.y) / 2
                    return (
                      <circle
                        key={`e${vi}`}
                        className="editor-addhandle"
                        cx={midX}
                        cy={midY}
                        r={addHandleSize / 2}
                        fill="#fff"
                        stroke={color}
                        strokeWidth={1.5}
                        onPointerDown={(e) => startDrag(e, sec.section_id, 'add', vi + 1)}
                        style={{ cursor: 'copy' }}
                      >
                        <title>Drag to add a vertex here</title>
                      </circle>
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

        <div className="map-drag-hint">Drag vertices to reshape · drag edge + to add · double-click vertex to remove</div>
      </div>

      <p className="editor-hint">
        Select a section, then drag its vertices or edges to map it onto the layout
        {selected && selectedSection && (
          <span className="editor-coords">
            {' · '}
            {selectedSection.section_name} · {selected.length} vertices · bbox{' '}
            {Math.round(bboxOf(selected).x)} {Math.round(bboxOf(selected).y)} {Math.round(bboxOf(selected).w)}{' '}
            {Math.round(bboxOf(selected).h)}
            {isDirty(selectedId) && ' (unsaved)'}
          </span>
        )}
        {selected && (
          <span className="editor-coords">
            {' · arrow keys nudge the selected vertex'}
          </span>
        )}
      </p>
    </div>
  )
}