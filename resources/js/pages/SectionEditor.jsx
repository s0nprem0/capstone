import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

const MIN_VERTICES = 3
const PICK = 12 // edge hit distance, in map units
const DRAG_THRESHOLD = 3

const parsePoints = (s) => {
  const nums = String(s || '')
    .trim()
    .split(/\s+/)
    .map(Number)
  const out = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isNaN(nums[i]) || Number.isNaN(nums[i + 1])) return []
    out.push([nums[i], nums[i + 1]])
  }
  return out
}

const toPointsString = (pts) =>
  pts
    .map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`)
    .join(' ')

const outlineFromViewbox = (viewBox) => {
  const parts = String(viewBox || '0 0 1791 1457').split(/\s+/).map(Number)
  if (parts.length !== 4) parts.splice(0, parts.length, 0, 0, 1791, 1457)
  const [x, y, w, h] = parts
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

// closest point on segment a-b to p → { d, x, y, t }
const segmentHit = (p, a, b) => {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const len2 = abx * abx + aby * aby
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return { d: Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby)), x: a[0] + t * abx, y: a[1] + t * aby, t }
}

export default function SectionEditor() {
  const [params] = useSearchParams()
  const sectionId = Number(params.get('section'))

  const [section, setSection] = useState(null)
  const [pts, setPts] = useState([])
  const [selected, setSelected] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState('')

  const svgRef = useRef(null)
  const vbRef = useRef([...MAP_VIEWBOX])
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const dragRef = useRef(null) // { type:'vertex', idx } | { type:'pan', x, y, vb }
  const movedRef = useRef(false)
  const armedRef = useRef(false)
  const lastSavedRef = useRef('')
  const savedTimerRef = useRef(null)

  const setVbBoth = useCallback((v) => {
    vbRef.current = v
    setVb(v)
  }, [])

  const locked = Boolean(section?.is_locked)

  // Load the section + trace from the map endpoint.
  useEffect(() => {
    let alive = true
    api('/api/map').then(({ ok, data }) => {
      if (!alive) return
      if (!ok) {
        setError(data?.error || 'Failed to load map data')
        return
      }
      const sec = (data?.sections || []).find((s) => Number(s.section_id) === sectionId)
      if (!sec) {
        setError('Section not found')
        return
      }
      setSection(sec)
      const parsed = parsePoints(sec.points)
      const initial = parsed.length >= MIN_VERTICES ? parsed : outlineFromViewbox(sec.viewBox)
      setPts(initial)
      lastSavedRef.current = toPointsString(initial)
    })
    return () => {
      alive = false
    }
  }, [sectionId])

  // Fly to the section's outline/viewbox once loaded.
  useEffect(() => {
    if (!section) return
    const target = section.points ? pts : outlineFromViewbox(section.viewBox)
    // Only auto-fly once on section load, before user edits.
    if (!dirty) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const xs = target.map((p) => p[0])
      const ys = target.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(...xs) - x || 1
      const h = Math.max(...ys) - y || 1
      const pad = Math.max(60, w * 0.15, h * 0.15)
      setVbBoth([x - pad, y - pad, w + pad * 2, h + pad * 2])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.section_id])

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

  const flashSaved = useCallback(() => {
    setSavedAt(Date.now())
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 2000)
  }, [])

  const save = async () => {
    if (!section || locked) return
    setError('')
    setSaving(true)
    const { ok, data } = await api(`/api/sections/${section.section_id}`, {
      method: 'POST',
      body: { points: toPointsString(pts) },
    })
    setSaving(false)
    if (ok) {
      lastSavedRef.current = data.svg_points || toPointsString(pts)
      setDirty(false)
      setSelected(null)
      flashSaved()
    } else {
      setError(data?.error || 'Save failed')
    }
  }

  const reset = () => {
    setPts(parsePoints(lastSavedRef.current))
    setDirty(false)
    setSelected(null)
  }

  const toggleLock = async () => {
    if (!section) return
    setError('')
    const { ok, data } = await api(`/api/sections/${section.section_id}`, {
      method: 'POST',
      body: { is_locked: !locked },
    })
    if (ok) {
      setSection((s) => ({ ...s, ...data }))
      const fromServer = parsePoints(data.svg_points)
      if (fromServer.length >= MIN_VERTICES) {
        setPts(fromServer)
        lastSavedRef.current = data.svg_points
        setDirty(false)
        setSelected(null)
      }
      flashSaved()
    } else {
      setError(data?.error || 'Failed to update lock')
    }
  }

  // --- interactions ---
  const onSvgPointerDown = (e) => {
    if (locked) {
      // locked: allow panning only
      dragRef.current = { type: 'pan', x: e.clientX, y: e.clientY, vb: [...vbRef.current] }
      movedRef.current = false
      svgRef.current.setPointerCapture(e.pointerId)
      return
    }
    dragRef.current = { type: 'pan', x: e.clientX, y: e.clientY, vb: [...vbRef.current] }
    movedRef.current = false
    armedRef.current = false
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onVertexPointerDown = (e, idx) => {
    if (locked) return
    e.stopPropagation()
    setSelected(idx)
    dragRef.current = { type: 'vertex', idx }
    armedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'vertex') {
      if (locked) return
      const pt = toSvg(e)
      const [ox, oy] = pts[drag.idx] || []
      if (!armedRef.current && Math.hypot(pt.x - ox, pt.y - oy) < DRAG_THRESHOLD) return
      armedRef.current = true
      setPts((prev) => prev.map((p, i) => (i === drag.idx ? [Math.round(pt.x), Math.round(pt.y)] : p)))
      setDirty(true)
      return
    }
    // pan
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) movedRef.current = true
    const [x, y, w, h] = drag.vb
    setVbBoth([x - (dx / (svgRef.current?.getBoundingClientRect().width || 1)) * w, y - (dy / (svgRef.current?.getBoundingClientRect().height || 1)) * h, w, h])
  }

  const finishGesture = (e) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.type !== 'pan') return
    if (movedRef.current || locked || pts.length < MIN_VERTICES) return
    // A clean click on empty map: add a vertex on the nearest edge.
    const pt = toSvg(e)
    let best = null
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const hit = segmentHit(pt, pts[i], pts[(i + 1) % n])
      if (hit.d <= PICK && (!best || hit.d < best.d)) best = { ...hit, after: i }
    }
    if (!best || best.t < 0.02 || best.t > 0.98) return
    const insertAt = best.after + 1
    setPts((prev) => [
      ...prev.slice(0, insertAt),
      [Math.round(best.x), Math.round(best.y)],
      ...prev.slice(insertAt),
    ])
    setSelected(insertAt)
    setDirty(true)
  }

  const removeVertex = () => {
    if (locked || selected == null || pts.length <= MIN_VERTICES) return
    setPts((prev) => prev.filter((_, i) => i !== selected))
    setSelected(null)
    setDirty(true)
  }

  useEffect(() => {
    const isEditable = (t) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

    const onKey = (e) => {
      if (isEditable(e.target)) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        reset()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        setSelected(null)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeVertex()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, pts.length, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the saved-flash timer on unmount.
  useEffect(() => () => clearTimeout(savedTimerRef.current), [])

  const fitOutline = () => {
    if (pts.length < MIN_VERTICES) return
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    const w = Math.max(...xs) - x || 1
    const h = Math.max(...ys) - y || 1
    const pad = Math.max(60, w * 0.15, h * 0.15)
    setVbBoth([x - pad, y - pad, w + pad * 2, h + pad * 2])
  }

  const verticesLabel = `${pts.length} vertex${pts.length === 1 ? '' : 'es'}`

  return (
    <div className="map-page">
      <div className="page-header">
        <h2>Section Editor — {section?.section_name || '…'}</h2>
        <div className="table-actions">
          {section && (
            <>
              <span className={`editor-dirty${saving || savedAt || dirty ? '' : ' editor-dirty--muted'}`} aria-live="polite">
                {saving ? 'Saving…' : savedAt ? 'Saved ✓' : dirty ? 'unsaved changes' : `${verticesLabel} · auto`}
              </span>
              <Link to={`/admin/sections`} className="btn btn-secondary btn-sm">
                Sections
              </Link>
              <Link to={`/admin/lots?section=${section.section_id}`} className="btn btn-secondary btn-sm">
                Edit lots
              </Link>
              <button type="button" className="btn btn-secondary btn-sm" onClick={reset} disabled={!dirty || saving}>
                Reset
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving || locked}>
                {saving ? 'Saving…' : 'Save outline'}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${locked ? 'btn-secondary' : 'btn-secondary'}`}
                onClick={toggleLock}
                disabled={saving}
                title={locked ? 'Unlock to edit this outline' : 'Freeze this outline and its lot geometry'}
              >
                {locked ? '🔒 Unlock section' : '🔓 Lock section'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      )}
      {locked && section && (
        <p className="alert alert--info">
          🔒 This section is locked — its outline and lot positions are frozen. Unlock it to edit.
        </p>
      )}

      {!section && !error && <p className="text-muted">Loading…</p>}

      {section && (
        <div className="map-layout">
          <div className="map-svg-wrap">
            <svg
              ref={svgRef}
              className="map-svg editor-svg"
              viewBox={vb.join(' ')}
              preserveAspectRatio="xMidYMid meet"
              style={{ touchAction: 'none' }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            >
              <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} fill="#f4f1e8" />

              <g className="map-trace" opacity={0.5} pointerEvents="none">
                {TRACE_PATHS.map((d, i) => (
                  <path key={i} d={d} fill="#e9dcb8" stroke="#3E6B4C" strokeWidth={6} strokeLinejoin="round" />
                ))}
                <circle cx={TRACE_CIRCLE.cx} cy={TRACE_CIRCLE.cy} r={TRACE_CIRCLE.r} fill="#e9dcb8" stroke="#3E6B4C" strokeWidth={6} />
              </g>

              {pts.length >= MIN_VERTICES && (
                <polygon
                  points={toPointsString(pts)}
                  fill="#1d4ed8"
                  fillOpacity={locked ? 0.07 : 0.13}
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray={dirty ? '6 4' : undefined}
                  pointerEvents="none"
                />
              )}

              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={selected === i ? 7 : 5}
                  fill={selected === i ? '#1d4ed8' : '#fff'}
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  style={{ cursor: locked ? 'default' : 'move' }}
                  onPointerDown={locked ? undefined : (e) => onVertexPointerDown(e, i)}
                >
                  <title>{`Vertex ${i + 1} — ${p[0]}, ${p[1]}`}</title>
                </circle>
              ))}
            </svg>

            <div className="map-zoom-controls">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out" aria-label="Zoom out">−</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={fitOutline} title="Fit outline" aria-label="Fit outline">⌂</button>
            </div>

            <div className="map-drag-hint">
              {locked
                ? 'Locked — pan to inspect. Unlock to edit.'
                : 'Drag a vertex to move it · click an edge to add a vertex · select a vertex then Delete to remove one · Ctrl/Cmd+Z to undo'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}