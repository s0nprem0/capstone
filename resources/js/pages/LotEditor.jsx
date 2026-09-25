import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import { MAP_VIEWBOX, TRACE_CIRCLE, TRACE_PATHS } from '../map/tracePaths'

const STATUS_COLORS = { available: '#2f9e44', reserved: '#f59f00', occupied: '#c92a2a' }
const STATUS_LABELS = { available: 'Available', reserved: 'Reserved', occupied: 'Occupied' }
const LOT_TYPES = ['single', 'double', 'family']
const MIN_SIZE = 10
const NUDGE = 5

const parseViewBox = (s) => {
  const parts = String(s || MAP_VIEWBOX.join(' ')).split(/\s+/).map(Number)
  return parts.length === 4 ? parts : [...MAP_VIEWBOX]
}

const sectionOutline = (sec) => {
  const [x, y, w, h] = parseViewBox(sec?.viewBox)
  return { x, y, w, h }
}

const fromLot = (lot) => ({
  lot_code: lot.lot_code || '',
  block: lot.block || '',
  lot_type: lot.lot_type || 'single',
  price: lot.price ?? '',
  status: lot.status || 'available',
  description: lot.description || '',
})

export default function LotEditor() {
  const [params] = useSearchParams()
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const [sectionId, setSectionId] = useState(null)
  const [lots, setLots] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(null)
  const [drag, setDrag] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const panRef = useRef(null)
  const movedRef = useRef(false)
  const vbRef = useRef([...MAP_VIEWBOX])
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const saveTimerRef = useRef(null)
  const savedTimerRef = useRef(null)
  const pendingRef = useRef({}) // lot_id -> { svg_x, svg_y, svg_w, svg_h }
  const undoRef = useRef(null) // { lotId, prev: { svg_x, svg_y, svg_w, svg_h } }
  const [undoStamp, setUndoStamp] = useState(null)
  const dragArmedRef = useRef(false)

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

  const flashSaved = useCallback(() => {
    setSavedAt(Date.now())
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 1500)
  }, [])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(saveTimerRef.current)
    clearTimeout(savedTimerRef.current)
  }, [])

  const flushPending = useCallback(async () => {
    const entries = Object.entries(pendingRef.current)
    if (entries.length === 0) return
    pendingRef.current = {}
    clearTimeout(saveTimerRef.current)
    setSaving(true)
    const results = await Promise.all(
      entries.map(([id, body]) => api(`/api/lots/${id}`, { method: 'POST', body }))
    )
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      setError(failed[0].data?.error || 'Failed to save some lot changes')
    } else {
      setLots((prev) =>
        prev.map((l) => {
          const res = results.find((r) => r.ok && r.data?.lot_id === l.lot_id)
          return res ? { ...l, ...res.data } : l
        })
      )
      flashSaved()
    }
    setSaving(false)
  }, [flashSaved])

  const queueSave = useCallback(() => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushPending(), 400)
  }, [flushPending])

  const undo = useCallback(async () => {
    const entry = undoRef.current
    if (!entry) return
    setError('')
    clearTimeout(saveTimerRef.current)
    delete pendingRef.current[entry.lotId]
    const { ok, data } = await api(`/api/lots/${entry.lotId}`, { method: 'POST', body: entry.prev })
    if (ok) {
      setLots((prev) => prev.map((l) => (l.lot_id === entry.lotId ? { ...l, ...data } : l)))
      flashSaved()
    } else {
      setError(data?.error || 'Undo failed')
    }
    undoRef.current = null
    setUndoStamp(null)
  }, [flashSaved])

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

  // Initial load + default section (URL ?section= wins).
  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (!ok) {
        setError(data?.error || 'Failed to load map data')
        return
      }
      setMapData(data)
      if (data?.sections?.length) {
        const fromUrl = Number(params.get('section'))
        setSectionId((cur) => {
          if (cur != null) return cur
          return data.sections.some((s) => s.section_id === fromUrl)
            ? fromUrl
            : data.sections[0].section_id
        })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sectionRow = useMemo(
    () => mapData?.sections.find((s) => s.section_id === sectionId) || null,
    [mapData, sectionId]
  )

  // Seed the local lot list when the section changes.
  useEffect(() => {
    if (!sectionRow) return
    setLots(sectionRow.lots || [])
    setSelectedId(null)
    setForm(null)
  }, [sectionRow?.section_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to the section when it (or the data) changes.
  const focusKey = sectionId
  useEffect(() => {
    if (!mapData || focusKey == null) return
    const sec = mapData.sections.find((s) => s.section_id === focusKey)
    if (!sec) return
    const [x, y, w, h] = parseViewBox(sec.viewBox)
    const pad = Math.max(60, w * 0.15, h * 0.15)
    flyTo([x - pad, y - pad, w + pad * 2, h + pad * 2])
  }, [focusKey, mapData]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLot = lots.find((l) => l.lot_id === selectedId) || null

  const onLotPointerDown = (e, lot, mode) => {
    e.stopPropagation()
    setSelectedId(lot.lot_id)
    setForm(fromLot(lot))
    dragArmedRef.current = false
    setDrag({
      mode,
      lotId: lot.lot_id,
      start: toSvg(e),
      origX: lot.svg_x,
      origY: lot.svg_y,
      origW: lot.svg_w,
      origH: lot.svg_h,
    })
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onSvgPointerDown = (e) => {
    panRef.current = { x: e.clientX, y: e.clientY, vb: [...vbRef.current] }
    movedRef.current = false
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (drag) {
      const pt = toSvg(e)
      const lot = lots.find((l) => l.lot_id === drag.lotId)
      if (!lot) return
      // Ignore sub-threshold jitter so a plain click never moves a lot.
      const dx = pt.x - drag.start.x
      const dy = pt.y - drag.start.y
      if (!dragArmedRef.current && Math.abs(dx) + Math.abs(dy) < 3) return
      dragArmedRef.current = true
      let next
      if (drag.mode === 'move') {
        next = {
          svg_x: Math.round(drag.origX + dx),
          svg_y: Math.round(drag.origY + dy),
        }
      } else {
        next = {
          svg_w: Math.max(MIN_SIZE, Math.round(drag.origW + dx)),
          svg_h: Math.max(MIN_SIZE, Math.round(drag.origH + dy)),
        }
      }
      setLots((prev) => prev.map((l) => (l.lot_id === drag.lotId ? { ...l, ...next } : l)))
      pendingRef.current[drag.lotId] = { ...next }
      queueSave()
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
    if (panRef.current && !movedRef.current && !drag) setSelectedId(null)
    panRef.current = null
    if (drag) {
      if (dragArmedRef.current) {
        undoRef.current = {
          lotId: drag.lotId,
          prev: { svg_x: drag.origX, svg_y: drag.origY, svg_w: drag.origW, svg_h: drag.origH },
        }
        setUndoStamp(Date.now())
      }
      setDrag(null)
      flushPending()
    }
  }

  // Arrow keys nudge the selected lot (Shift+arrows resize), Ctrl/Cmd+Z undoes
  // the last geometry change, Escape deselects.
  useEffect(() => {
    const isEditable = (t) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        if (isEditable(e.target)) return
        e.preventDefault()
        undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        setSelectedId(null)
        return
      }
      if (selectedId == null) return
      const dir = { ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE], ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0] }[e.key]
      if (!dir) return
      e.preventDefault()
      const lot = lots.find((l) => l.lot_id === selectedId)
      if (!lot) return
      const prev = { svg_x: lot.svg_x, svg_y: lot.svg_y, svg_w: lot.svg_w, svg_h: lot.svg_h }
      let next
      if (e.shiftKey) {
        next = {
          svg_w: Math.max(MIN_SIZE, Math.round(lot.svg_w + dir[0])),
          svg_h: Math.max(MIN_SIZE, Math.round(lot.svg_h + dir[1])),
        }
      } else {
        next = { svg_x: Math.round(lot.svg_x + dir[0]), svg_y: Math.round(lot.svg_y + dir[1]) }
      }
      setLots((p) => p.map((l) => (l.lot_id === selectedId ? { ...l, ...next } : l)))
      pendingRef.current[selectedId] = { ...next }
      undoRef.current = { lotId: selectedId, prev }
      setUndoStamp(Date.now())
      queueSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, lots, queueSave, undo])

  const handleSaveForm = async (e) => {
    e.preventDefault()
    if (selectedId == null || !form) return
    setError('')
    const { ok, data } = await api(`/api/lots/${selectedId}`, {
      method: 'POST',
      body: { ...form, price: Number(form.price) || 0 },
    })
    if (ok) {
      setLots((prev) => prev.map((l) => (l.lot_id === selectedId ? { ...l, ...data } : l)))
      flashSaved()
    } else {
      setError(data?.error || 'Failed to save lot')
    }
  }

  const setStatusQuick = async (status) => {
    if (selectedId == null) return
    setError('')
    const { ok, data } = await api(`/api/lots/${selectedId}`, { method: 'POST', body: { status } })
    if (ok) {
      setLots((prev) => prev.map((l) => (l.lot_id === selectedId ? { ...l, ...data } : l)))
      setForm((f) => (f ? { ...f, status: data.status } : f))
      flashSaved()
    } else {
      setError(data?.error || 'Failed to update status')
    }
  }

  const addLot = async () => {
    if (!sectionRow) return
    setError('')
    const box = sectionOutline(sectionRow)
    let n = 1
    const codes = new Set(lots.map((l) => l.lot_code))
    let code = ''
    const prefix = sectionRow.section_name.replace(/\s+/g, '').toUpperCase()
    do {
      code = `${prefix}-${n++}`
    } while (codes.has(code))
    const { ok, data } = await api('/api/lots', {
      method: 'POST',
      body: {
        lot_code: code,
        section_id: sectionId,
        block: null,
        lot_type: 'single',
        price: 0,
        status: 'available',
        description: '',
        svg_x: Math.round(box.x + 4),
        svg_y: Math.round(box.y + 4),
        svg_w: 40,
        svg_h: 40,
      },
    })
    if (ok) {
      setLots((prev) => [data, ...prev])
      setSelectedId(data.lot_id)
      setForm(fromLot(data))
      flashSaved()
    } else {
      setError(data?.error || 'Failed to add lot')
    }
  }

  const removeLot = async () => {
    if (selectedId == null) return
    setError('')
    const { ok, data } = await api(`/api/lots/${selectedId}/delete`, { method: 'POST' })
    if (ok) {
      setLots((prev) => prev.filter((l) => l.lot_id !== selectedId))
      setSelectedId(null)
      setForm(null)
      flashSaved()
    } else {
      setError(data?.error || 'Delete failed')
    }
  }

  const reflow = async () => {
    if (sectionId == null) return
    setError('')
    const { ok, data } = await api('/api/lots/regrid', { method: 'POST', body: { section_id: sectionId } })
    if (!ok) {
      setError(data?.error || 'Reflow failed')
      return
    }
    const res = await api('/api/map')
    if (res.ok) {
      setMapData(res.data)
      const sec = res.data.sections.find((s) => s.section_id === sectionId)
      if (sec) {
        setLots(sec.lots || [])
        setSelectedId(null)
        setForm(null)
      }
    }
    flashSaved()
  }

  const showLabels = vb[2] < 700
  const box = sectionRow ? sectionOutline(sectionRow) : null

  return (
    <div className="map-page">
      <div className="page-header">
        <h2>Lot Editor</h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={reflow} disabled={!sectionRow || saving}>
            Reflow grid
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={addLot} disabled={!sectionRow || saving}>
            + Add lot
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={undo}
            disabled={!undoStamp || saving}
            title="Undo last move, resize or nudge (Ctrl/Cmd+Z)"
          >
            ↶ Undo
          </button>
          <span
            className={`editor-dirty${saving || savedAt ? '' : ' editor-dirty--muted'}`}
            aria-live="polite"
          >
            {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'changes auto-save'}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      )}

      <div className="editor-chips">
        <div className="editor-chips-list">
          {(mapData?.sections || []).map((sec) => (
            <button
              key={sec.section_id}
              type="button"
              className={`editor-chip${sec.section_id === sectionId ? ' editor-chip--active' : ''}`}
              onClick={() => setSectionId(sec.section_id)}
              title={`Show ${sec.section_name} lots`}
            >
              {sec.section_name}
            </button>
          ))}
        </div>
        <span className="editor-title">
          {sectionRow
            ? `${sectionRow.section_name} · ${lots.length} lot${lots.length === 1 ? '' : 's'}`
            : 'Loading sections…'}
        </span>
      </div>

      {!mapData && <p className="text-muted">Loading map…</p>}

      {mapData && (
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

              {sectionRow && (
                <g pointerEvents="none">
                  {sectionRow.points ? (
                    <polygon
                      points={sectionRow.points}
                      fill="#1d4ed8"
                      opacity={0.06}
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      strokeDasharray="8 6"
                      strokeLinejoin="round"
                    />
                  ) : (
                    box && (
                      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="#1d4ed8" opacity={0.06} stroke="#1d4ed8" strokeWidth={2} strokeDasharray="8 6" />
                    )
                  )}
                </g>
              )}

              <g className="lot-editor-lots">
                {lots.map((lot) => {
                  const isSel = lot.lot_id === selectedId
                  return (
                    <g
                      key={lot.lot_id}
                      className="lot-editor-lot"
                      onPointerDown={(e) => onLotPointerDown(e, lot, 'move')}
                      style={{ cursor: 'move' }}
                      role="img"
                      aria-label={`${lot.lot_code} · ${STATUS_LABELS[lot.status] || lot.status} lot`}
                    >
                      <rect
                        className="lot-shape"
                        x={lot.svg_x}
                        y={lot.svg_y}
                        width={Math.max(0, lot.svg_w)}
                        height={Math.max(0, lot.svg_h)}
                        rx={2}
                        fill={STATUS_COLORS[lot.status] || '#868e96'}
                        fillOpacity={isSel ? 1 : 0.85}
                        stroke={isSel ? '#111' : '#fff'}
                        strokeWidth={isSel ? 3 : 1}
                        strokeDasharray={lot.status === 'reserved' && !isSel ? '5 4' : undefined}
                      />
                      {showLabels && (
                        <text
                          x={lot.svg_x + (lot.svg_w || 0) / 2}
                          y={lot.svg_y + (lot.svg_h || 0) / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="lot-label"
                          pointerEvents="none"
                        >
                          {lot.lot_code}
                        </text>
                      )}
                      {isSel && (
                        <g onPointerDown={(e) => onLotPointerDown(e, lot, 'resize')} style={{ cursor: 'nwse-resize' }}>
                          <rect
                            x={lot.svg_x + lot.svg_w - 26}
                            y={lot.svg_y + lot.svg_h - 26}
                            width={26}
                            height={26}
                            fill="transparent"
                          />
                          <rect
                            x={lot.svg_x + lot.svg_w - 12}
                            y={lot.svg_y + lot.svg_h - 12}
                            width={12}
                            height={12}
                            rx={2}
                            fill="#fff"
                            stroke="#111"
                            strokeWidth={1.5}
                            pointerEvents="none"
                          />
                          <title>Drag to resize</title>
                        </g>
                      )}
                      <title>{`${lot.lot_code} · ${STATUS_LABELS[lot.status] || lot.status} · ₱${Number(lot.price || 0).toLocaleString()}`}</title>
                    </g>
                  )
                })}
              </g>
            </svg>

            {mapData && sectionRow && lots.length === 0 && (
              <div className="editor-empty">
                No lots in this section yet — click <b>+ Add lot</b> to place the first one.
              </div>
            )}

            <div className="map-zoom-controls">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.5)} title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1 / 1.5)} title="Zoom out" aria-label="Zoom out">−</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => flyTo([...MAP_VIEWBOX])} title="Fit view" aria-label="Fit view">⌂</button>
            </div>

            <div className="map-drag-hint">
              Click to select · drag to move · corner handle to resize · arrows nudge · Shift+arrows resize · Ctrl/Cmd+Z undo
            </div>
          </div>

          {selectedLot && form && (
            <aside className="map-detail">
              <h3>Edit Lot — {form.lot_code || selectedLot.lot_code}</h3>

              <p className="text-muted editor-coords">
                Position {Math.round(selectedLot.svg_x)}, {Math.round(selectedLot.svg_y)} ·{' '}
                {Math.round(selectedLot.svg_w)} × {Math.round(selectedLot.svg_h)}
              </p>

              <form onSubmit={handleSaveForm}>
                <div className="editor-form-grid">
                  <label>
                    Lot code
                    <input name="lot_code" value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} required maxLength="20" />
                  </label>
                  <label>
                    Block
                    <input name="block" value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} maxLength="20" placeholder="e.g. A-1" />
                  </label>
                  <label>
                    Type
                    <select name="lot_type" value={form.lot_type} onChange={(e) => setForm({ ...form, lot_type: e.target.value })}>
                      {LOT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Price (₱)
                    <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                  </label>
                </div>

                <label className="editor-block-label">
                  Status
                  <select name="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>

                <div className="editor-status-chips">
                  {Object.entries(STATUS_LABELS).map(([k, v]) => {
                    const isActive = form.status === k
                    return (
                      <button
                        key={k}
                        type="button"
                        className="chip"
                        aria-pressed={isActive}
                        onClick={() => setStatusQuick(k)}
                        style={{
                          borderColor: STATUS_COLORS[k],
                          ...(isActive ? { background: STATUS_COLORS[k], color: '#fff' } : {}),
                        }}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>

                <label className="editor-block-label">
                  Description
                  <textarea rows="2" name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
                </label>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    Save lot
                  </button>
                  <ConfirmButton
                    label="Delete"
                    danger
                    onConfirm={removeLot}
                    busy={saving}
                    message={`Delete ${form.lot_code}? This is only allowed while it has no reservations, payments, or burial records.`}
                  />
                </div>
              </form>
            </aside>
          )}
        </div>
      )}

      <div className="map-legend lot-editor-legend">
        <span><i className="dot" style={{ background: STATUS_COLORS.available }} /> Available</span>
        <span><i className="dot" style={{ background: STATUS_COLORS.reserved }} /> Reserved</span>
        <span><i className="dot" style={{ background: STATUS_COLORS.occupied }} /> Occupied</span>
      </div>
    </div>
  )
}