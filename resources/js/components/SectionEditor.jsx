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

const initialPts = (section) =>
  strToPts(section.points ?? section.svg_points) ||
  (() => {
    const [x, y, w, h] = parseViewBox(section.viewBox)
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ]
  })()

export default function SectionEditor({ sections, onSaved, onCancel, focusSectionId = null }) {
  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const panRef = useRef(null)
  const movedRef = useRef(false)
  // Pointer capture retargets click/dblclick to the SVG, so track which vertex
  // handle got the last pointerdown and handle double-click deletion up there.
  const lastVertexRef = useRef(null)
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
  const [showPlots, setShowPlots] = useState(true)
  const [live, setLive] = useState(null) // coordinate readout while dragging
  const [plots, setPlots] = useState(null) // /api/map lot grid reference
  const undoRef = useRef([]) // [{ sectionId, pts }] snapshots for undo
  const redoRef = useRef([])
  const movePushedRef = useRef(false)

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

  // Optional: jump to and select one section on open (used by the Sections manager).
  const focusDone = useRef(null)
  useEffect(() => {
    if (focusSectionId == null || focusDone.current === focusSectionId) return
    const pts = edits[focusSectionId]
    if (!pts) return
    focusDone.current = focusSectionId
    setSelectedId(focusSectionId)
    setSelectedVertex(null)
    const bbox = bboxOf(pts)
    const pad = Math.max(80, bbox.w * 0.2, bbox.h * 0.2)
    const t = setTimeout(
      () => flyTo([bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2]),
      60
    )
    return () => clearTimeout(t)
  }, [focusSectionId, edits, flyTo])

  const isDirty = useCallback(
    (sectionId) => {
      const s = sections.find((sec) => sec.section_id === sectionId)
      const pts = edits[sectionId]
      if (!s || !pts) return false
      const orig = strToPts(s.points ?? s.svg_points) || initialPts(s)
      return ptsToStr(pts) !== ptsToStr(orig)
    },
    [sections, edits]
  )

  const dirtyCount = sections.filter((s) => isDirty(s.section_id)).length

  const pushHistory = useCallback((sectionId) => {
    const pts = edits[sectionId]
    if (!pts) return
    undoRef.current.push({ sectionId, pts: pts.map((p) => ({ ...p })) })
    if (undoRef.current.length > 50) undoRef.current.shift()
    redoRef.current = []
  }, [edits])

  const undo = useCallback(() => {
    const last = undoRef.current.pop()
    if (!last) return
    const pts = edits[last.sectionId]
    if (pts) redoRef.current.push({ sectionId: last.sectionId, pts: pts.map((p) => ({ ...p })) })
    setSelectedVertex(null)
    setEdits((prev) => ({ ...prev, [last.sectionId]: last.pts }))
  }, [edits])

  const redo = useCallback(() => {
    const last = redoRef.current.pop()
    if (!last) return
    const pts = edits[last.sectionId]
    if (pts) undoRef.current.push({ sectionId: last.sectionId, pts: pts.map((p) => ({ ...p })) })
    setSelectedVertex(null)
    setEdits((prev) => ({ ...prev, [last.sectionId]: last.pts }))
  }, [edits])

  // Faint plot grid (from /api/map) as a mapping reference.
  useEffect(() => {
    api('/api/map')
      .then(({ ok, data }) => { if (ok) setPlots(data) })
      .catch(() => {})
  }, [])

  // Jump to and select a section (used by the chips row).
  const focusSection = useCallback((id) => {
    const pts = edits[id]
    if (!pts) return
    setSelectedId(id)
    setSelectedVertex(null)
    const bbox = bboxOf(pts)
    const pad = Math.max(80, bbox.w * 0.25, bbox.h * 0.25)
    flyTo([bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2])
  }, [edits, flyTo])

  const startDrag = (e, sectionId, type, index) => {
    if (saving) return
    movePushedRef.current = false
    if (type !== 'move') pushHistory(sectionId)
    e.stopPropagation()
    const pt = toSvg(e)
    lastVertexRef.current = type === 'vertex' ? { sectionId, index } : null
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
    lastVertexRef.current = null
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
          setLive({ what: `Vertex ${drag.index + 1}`, x: cur.x, y: cur.y })
          return { ...prev, [drag.sectionId]: pts }
        }
        if (drag.type === 'add') {
          const pts = [...drag.orig.slice(0, drag.index), cur, ...drag.orig.slice(drag.index)]
          setLive({ what: 'New vertex', x: cur.x, y: cur.y })
          return { ...prev, [drag.sectionId]: pts }
        }
        // move whole polygon: shift all vertices, clamped so the bbox stays in map bounds
        const dx = snap(pt.x - drag.start.x)
        const dy = snap(pt.y - drag.start.y)
        const bbox = bboxOf(drag.orig)
        const sx = Math.max(-bbox.x, Math.min(MAP_W - bbox.w, dx))
        const sy = Math.max(-bbox.y, Math.min(MAP_H - bbox.h, dy))
        if (sx === 0 && sy === 0) return prev
        if (!movePushedRef.current) {
          movePushedRef.current = true
          pushHistory(drag.sectionId)
        }
        setLive({ what: 'Move', x: sx, y: sy })
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
    setLive(null)
  }

  const removeVertex = (sectionId, index) => {
    if ((edits[sectionId]?.length ?? 0) > MIN_VERTICES) pushHistory(sectionId)
    setEdits((prev) => {
      const pts = prev[sectionId]
      if (!pts || pts.length <= MIN_VERTICES) return prev
      return { ...prev, [sectionId]: pts.filter((_, i) => i !== index) }
    })
    if (sectionId === selectedId && index === selectedVertex) setSelectedVertex(null)
  }

  const deleteSelectedVertex = () => {
    if (selectedId == null || selectedVertex == null) return
    removeVertex(selectedId, selectedVertex)
  }

  // Keyboard: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Del/Backspace removes
  // the selected vertex, Escape deselects, arrows nudge the selected vertex.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'z' && mod && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.key === 'z' && mod && e.shiftKey) || (e.key === 'y' && mod)) {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Escape') {
        setSelectedVertex(null)
        return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId != null && selectedVertex != null) {
        e.preventDefault()
        deleteSelectedVertex()
        return
      }
      if (selectedId == null || selectedVertex == null || mod || e.altKey) return
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]
      if (!dir) return
      e.preventDefault()
      pushHistory(selectedId)
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
  }, [selectedId, selectedVertex, undo, redo, pushHistory, deleteSelectedVertex])

  const onSvgDoubleClick = () => {
    const v = lastVertexRef.current
    if (!v) return
    removeVertex(v.sectionId, v.index)
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
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={undo}
            disabled={saving || undoRef.current.length === 0}
            title="Undo last change (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={redo}
            disabled={saving || redoRef.current.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↪ Redo
          </button>
          {selectedId != null && selectedVertex != null && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={deleteSelectedVertex}
              disabled={saving || (edits[selectedId]?.length ?? 0) <= MIN_VERTICES}
              title={
                (edits[selectedId]?.length ?? 0) <= MIN_VERTICES
                  ? 'A section needs at least 4 vertices'
                  : 'Remove the selected vertex (or double-click it)'
              }
            >
              ⌫ Delete vertex
            </button>
          )}
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

      <div className="editor-chips">
        <div className="editor-chips-list">
          {sections.map((sec) => {
            const active = sec.section_id === selectedId
            const dirty = isDirty(sec.section_id)
            return (
              <button
                key={sec.section_id}
                type="button"
                className={`editor-chip${active ? ' editor-chip--active' : ''}${dirty ? ' editor-chip--dirty' : ''}`}
                onClick={() => focusSection(sec.section_id)}
                title={active ? `${sec.section_name} selected — click its shape to edit` : `Jump to ${sec.section_name}`}
              >
                {sec.section_name}
                {dirty && ' •'}
              </button>
            )
          })}
        </div>
        <label className="map-toggle map-toggle--editor">
          <input type="checkbox" checked={showPlots} onChange={(e) => setShowPlots(e.target.checked)} />
          Show plots
        </label>
      </div>

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
          onDoubleClick={onSvgDoubleClick}
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

          {showPlots && plots?.sections && (
            <g className="editor-plots" pointerEvents="none">
              {plots.sections.flatMap((s) =>
                (s.lots || []).map((l) => (
                  <rect key={l.lot_id} x={l.svg_x} y={l.svg_y} width={l.svg_w} height={l.svg_h} rx={1.5} fill="#2f9e44" opacity={0.3} />
                ))
              )}
            </g>
          )}

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
                      style={{ cursor: 'move' }}
                    >
                      <title>{`Vertex ${vi + 1} · select it, then press Delete vertex (double-click also works)`}</title>
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

        <div className="map-drag-hint">Drag vertices to reshape · drag edge + to add a vertex · double-click a vertex to delete</div>
      </div>

      <p className="editor-hint">
        Drag vertices to reshape · grab the body to move · drag a blank spot to pan
        {selected && selectedSection && (
          <span className="editor-coords">
            {' · '}
            {selectedSection.section_name} · {selected.length} vertices · bbox{' '}
            {Math.round(bboxOf(selected).x)} {Math.round(bboxOf(selected).y)} {Math.round(bboxOf(selected).w)}{' '}
            {Math.round(bboxOf(selected).h)}
            {isDirty(selectedId) ? ' (unsaved)' : ''}
          </span>
        )}
        {live && (
          <span className="editor-coords">
            {' · '}
            {live.what}: {live.x}, {live.y}
          </span>
        )}
        <span className="editor-coords">{' · Ctrl+Z undo · Del removes the selected vertex'}</span>
      </p>
    </div>
  )
}