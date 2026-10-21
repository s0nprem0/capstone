import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import Select from '../components/Select'
import Combobox from '../components/Combobox'
import Icon from '../components/Icon'
import ZoomControls from '../components/ZoomControls'
import PlotShape from '../map/PlotShape'
import { STATUS_COLORS } from '../components/CemeterySvgMap'
import { MAP_VIEWBOX } from '../map/tracePaths'
import { DEFAULT_REFERENCE, MapReferenceImage, readReference, saveReference } from '../map/reference'
import { LOT_STATUS, LOT_TYPES as LOT_TYPE_LABELS, PLOT_STATUSES, money } from '../lib/terms'
import {
  boxOf,
  byCode,
  geometryOf,
  moveBy,
  overlaps,
  placeNewLot,
  plotArea,
  reshape,
  resizeBy,
  round2,
  shortLabel,
  typicalSize,
} from '../map/lotGeometry'

const LOT_TYPES = ['single', 'double', 'family']
const HISTORY_LIMIT = 100
const COALESCE_MS = 800
const DRAG_THRESHOLD_PX = 3

const sameValue = (a, b) => {
  if ((a ?? '') === (b ?? '')) return true
  if (a == null || b == null || a === '' || b === '') return false
  const na = Number(a)
  const nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]))

const isEditableTarget = (t) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
    t.getAttribute('role') === 'combobox' ||
    Boolean(t.closest('[role="listbox"]')))

const SHORTCUTS = [
  ['Click', 'Select a lot'],
  ['Shift + click', 'Add or remove from the selection'],
  ['Shift + drag', 'Select every lot in a box (start on empty map)'],
  ['Drag', 'Move the selection'],
  ['Arrows', 'Nudge 1 unit (Alt: 0.1)'],
  ['Shift + arrows', 'Resize'],
  ['[  ]', 'Previous / next lot by code'],
  ['Ctrl + A', 'Select all (or all highlighted)'],
  ['Ctrl + D', 'Add a lot beside the selected one'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Shift + Z', 'Redo'],
  ['Esc', 'Clear the selection'],
]

export default function LotEditor() {
  const [params, setParams] = useSearchParams()
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const [sectionId, setSectionId] = useState(null)
  const [selected, setSelected] = useState([])
  const [filter, setFilter] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const marqueeRef = useRef(null)
  const [saveState, setSaveState] = useState('idle')
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [reference, setReference] = useState(readReference)
  const [, setHistoryVersion] = useState(0)

  const svgRef = useRef(null)
  const rafRef = useRef(null)
  const gestureRef = useRef(null)
  const vbRef = useRef([...MAP_VIEWBOX])
  const [vb, setVb] = useState([...MAP_VIEWBOX])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const saveTimerRef = useRef(null)
  const savedTimerRef = useRef(null)
  const pendingRef = useRef(new Map()) // lot_id -> { body, prev }
  const chainRef = useRef(Promise.resolve())
  const undoRef = useRef([])
  const redoRef = useRef([])
  const lotIndexRef = useRef(new Map())
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const setVbBoth = useCallback((next) => {
    vbRef.current = next
    setVb(next)
  }, [])

  const bumpHistory = () => setHistoryVersion((v) => v + 1)

  const updateReference = (patch) => {
    setReference((current) => {
      const next = { ...current, ...patch }
      saveReference(next)
      return next
    })
  }

  // ---- data -------------------------------------------------------------

  const sectionRow = useMemo(
    () => mapData?.sections.find((s) => s.section_id === sectionId) || null,
    [mapData, sectionId]
  )
  const lots = useMemo(() => sectionRow?.lots || [], [sectionRow])
  const locked = Boolean(sectionRow?.is_locked)
  const sortedLots = useMemo(() => [...lots].sort(byCode), [lots])
  const typical = useMemo(() => typicalSize(lots), [lots])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedLots = useMemo(() => lots.filter((l) => selectedSet.has(l.lot_id)), [lots, selectedSet])
  const primaryId = selected[selected.length - 1] ?? null
  const primaryLot = lots.find((l) => l.lot_id === primaryId) || null

  const lotIndex = useMemo(() => {
    const index = new Map()
    for (const s of mapData?.sections || []) for (const l of s.lots || []) index.set(l.lot_id, l)
    return index
  }, [mapData])
  lotIndexRef.current = lotIndex

  const counts = useMemo(() => {
    const c = Object.fromEntries(PLOT_STATUSES.map((s) => [s, 0]))
    for (const l of lots) if (l.status in c) c[l.status]++
    return c
  }, [lots])

  // Every edit lands in the one map snapshot, so switching sections and back
  // shows what was saved rather than the positions from page load.
  const setLocal = useCallback((changes) => {
    if (!changes.length) return
    const byId = new Map(changes.map((c) => [c.id, c.next]))
    setMapData((prev) =>
      prev && {
        ...prev,
        sections: prev.sections.map((s) =>
          s.lots?.some((l) => byId.has(l.lot_id))
            ? { ...s, lots: s.lots.map((l) => (byId.has(l.lot_id) ? { ...l, ...byId.get(l.lot_id) } : l)) }
            : s
        ),
      }
    )
  }, [])

  const updateSectionLots = useCallback((id, fn) => {
    setMapData((prev) =>
      prev && { ...prev, sections: prev.sections.map((s) => (s.section_id === id ? { ...s, lots: fn(s.lots || []) } : s)) }
    )
  }, [])

  const announce = (text) => setAnnouncement(text)

  // ---- saving -----------------------------------------------------------

  const flush = useCallback(() => {
    clearTimeout(saveTimerRef.current)
    const entries = [...pendingRef.current]
    pendingRef.current = new Map()
    if (!entries.length) return chainRef.current
    setSaveState('saving')
    // Requests run one batch at a time, so a slow save can never land after a
    // newer one for the same lot and put the old value back.
    chainRef.current = chainRef.current.then(async () => {
      const results = await Promise.all(
        entries.map(([id, { body }]) => api(`/api/lots/${id}`, { method: 'POST', body }).then((r) => ({ id, ...r })))
      )
      const stillPending = (id, values) => {
        const again = pendingRef.current.get(id)?.body
        return again ? Object.fromEntries(Object.entries(values).filter(([k]) => !(k in again))) : values
      }
      const ok = results.filter((r) => r.ok)
      const failed = results.filter((r) => !r.ok)
      setLocal(ok.map((r) => ({ id: r.id, next: stillPending(r.id, r.data) })))
      if (failed.length) {
        const prevById = new Map(entries.map(([id, v]) => [id, v.prev]))
        setLocal(failed.map((r) => ({ id: r.id, next: stillPending(r.id, prevById.get(r.id)) })))
        const first = failed[0].data?.error || 'A change could not be saved'
        setError(failed.length > 1 ? `${first} (${failed.length} lots were not saved and were put back.)` : `${first} The change was put back.`)
      }
      if (pendingRef.current.size === 0) {
        setSaveState(failed.length ? 'error' : 'saved')
        clearTimeout(savedTimerRef.current)
        if (!failed.length) savedTimerRef.current = setTimeout(() => setSaveState('idle'), 1800)
      }
    })
    return chainRef.current
  }, [setLocal])

  const scheduleFlush = useCallback(
    (delay) => {
      clearTimeout(saveTimerRef.current)
      if (delay > 0) {
        setSaveState('pending')
        saveTimerRef.current = setTimeout(flush, delay)
      } else {
        flush()
      }
    },
    [flush]
  )

  // One path for every change: apply it locally, queue it for the server and
  // record it for Undo. `prev` is passed when the lot has already been moved
  // locally (a drag), otherwise it is read off the lot.
  const commit = useCallback(
    (changes, { label = 'edit', delay = 0, record = true, coalesce = false } = {}) => {
      const real = []
      for (const c of changes) {
        const lot = lotIndexRef.current.get(c.id)
        if (!lot) continue
        const keys = Object.keys(c.next)
        const prev = c.prev ?? pick(lot, keys)
        if (keys.every((k) => sameValue(prev[k], c.next[k]))) continue
        real.push({ id: c.id, prev, next: c.next })
      }
      if (!real.length) return
      setError('')
      setLocal(real)
      for (const c of real) {
        const p = pendingRef.current.get(c.id)
        pendingRef.current.set(c.id, { body: { ...p?.body, ...c.next }, prev: { ...c.prev, ...p?.prev } })
      }
      if (record) {
        const now = Date.now()
        const last = undoRef.current[undoRef.current.length - 1]
        const sameTargets =
          last && last.changes.length === real.length && real.every((c) => last.changes.some((l) => l.id === c.id))
        if (coalesce && last && last.label === label && sameTargets && now - last.at < COALESCE_MS) {
          last.changes = last.changes.map((l) => {
            const c = real.find((r) => r.id === l.id)
            return { ...l, prev: { ...c.prev, ...l.prev }, next: { ...l.next, ...c.next } }
          })
          last.at = now
        } else {
          undoRef.current = [...undoRef.current, { label, changes: real, at: now }].slice(-HISTORY_LIMIT)
        }
        redoRef.current = []
        bumpHistory()
      }
      scheduleFlush(delay)
    },
    [setLocal, scheduleFlush]
  )

  const replay = (from, to, direction) => {
    const entry = from.current.pop()
    if (!entry) return
    commit(
      entry.changes.map((c) => ({ id: c.id, prev: direction === 'undo' ? c.next : c.prev, next: direction === 'undo' ? c.prev : c.next })),
      { record: false }
    )
    to.current.push(entry)
    bumpHistory()
    announce(`${direction === 'undo' ? 'Undid' : 'Redid'} ${entry.label}`)
  }
  const undo = () => replay(undoRef, redoRef, 'undo')
  const redo = () => replay(redoRef, undoRef, 'redo')
  const undoLabel = undoRef.current[undoRef.current.length - 1]?.label
  const redoLabel = redoRef.current[redoRef.current.length - 1]?.label

  useEffect(() => {
    const warn = (e) => {
      if (pendingRef.current.size === 0) return
      flush()
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      flush()
      cancelAnimationFrame(rafRef.current)
      clearTimeout(savedTimerRef.current)
    }
  }, [flush])

  // ---- view -------------------------------------------------------------

  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [Boolean(mapData)]) // eslint-disable-line react-hooks/exhaustive-deps

  const flyTo = useCallback(
    (target) => {
      cancelAnimationFrame(rafRef.current)
      const start = vbRef.current
      const t0 = performance.now()
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 450)
        const e = 1 - Math.pow(1 - k, 3)
        setVbBoth(start.map((s, i) => s + (target[i] - s) * e))
        if (k < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [setVbBoth]
  )

  // An aspect-correct frame around a rectangle, so the view does not
  // letterbox; a minimum width keeps one grave from filling the pane.
  const frameBox = (x0, y0, x1, y1, { pad = 0, minWidth = 0 } = {}) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const aspect = rect && rect.height > 0 ? rect.width / rect.height : 4096 / 3072
    const width = Math.max(minWidth, x1 - x0 + pad * 2, (y1 - y0 + pad * 2) * aspect)
    const height = width / aspect
    return [(x0 + x1) / 2 - width / 2, (y0 + y1) / 2 - height / 2, width, height]
  }

  const frameLots = (list, opts) => {
    if (!list.length) return null
    return frameBox(
      Math.min(...list.map((l) => l.svg_x)),
      Math.min(...list.map((l) => l.svg_y)),
      Math.max(...list.map((l) => l.svg_x + l.svg_w)),
      Math.max(...list.map((l) => l.svg_y + l.svg_h)),
      opts
    )
  }

  const fitSection = (sec = sectionRow) => {
    if (!sec) return
    const framed = frameLots(sec.lots || [], { pad: 40 })
    if (framed) {
      flyTo(framed)
      return
    }
    const area = plotArea(sec, [])
    const pad = Math.max(60, area.w * 0.15, area.h * 0.15)
    flyTo(frameBox(area.x, area.y, area.x + area.w, area.y + area.h, { pad }))
  }

  const zoomAt = useCallback(
    (px, py, factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [x, y, w, h] = vbRef.current
      const ux = (px / rect.width) * w + x
      const uy = (py / rect.height) * h + y
      const nw = Math.min(4000, Math.max(60, w / factor))
      const nh = (nw / w) * h
      setVbBoth([ux - (px / rect.width) * nw, uy - (py / rect.height) * nh, nw, nh])
    },
    [setVbBoth]
  )

  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.3 : 1 / 1.3)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, Boolean(mapData)]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomCenter = (factor) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  const scale = size.w > 0 ? Math.min(size.w / vb[2], size.h / vb[3]) : 0

  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const [x, y, w, h] = vbRef.current
    const s = Math.min(rect.width / w, rect.height / h)
    return {
      x: x + (e.clientX - rect.left - (rect.width - w * s) / 2) / s,
      y: y + (e.clientY - rect.top - (rect.height - h * s) / 2) / s,
    }
  }

  // ---- loading & section ------------------------------------------------

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (!ok) {
        setError(data?.error || 'Failed to load map data')
        return
      }
      setMapData(data)
      if (data?.sections?.length) {
        const fromUrl = Number(params.get('section'))
        setSectionId((cur) =>
          cur ?? (data.sections.some((s) => s.section_id === fromUrl) ? fromUrl : data.sections[0].section_id)
        )
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Framed on the section's plots rather than its viewBox: a viewBox is a
  // full-width band across the sheet, a few pixels per grave.
  useEffect(() => {
    if (sectionRow) fitSection(sectionRow)
  }, [sectionId, Boolean(mapData)]) // eslint-disable-line react-hooks/exhaustive-deps

  const chooseSection = (id) => {
    const next = Number(id)
    if (!Number.isFinite(next) || next === sectionId) return
    flush()
    setSectionId(next)
    setSelected([])
    setParams({ section: String(next) }, { replace: true })
  }

  const sections = mapData?.sections || []
  const sectionIndex = sections.findIndex((s) => s.section_id === sectionId)
  const stepSection = (dir) => {
    const next = sections[sectionIndex + dir]
    if (next) chooseSection(next.section_id)
  }

  const focusLot = (id) => {
    const lot = lots.find((l) => String(l.lot_id) === String(id))
    if (!lot) return
    setSelected([lot.lot_id])
    const pad = Math.max(12, lot.svg_w * 0.75, lot.svg_h * 0.75)
    flyTo(frameBox(lot.svg_x, lot.svg_y, lot.svg_x + lot.svg_w, lot.svg_y + lot.svg_h, { pad, minWidth: 360 }))
  }

  const stepLot = (dir) => {
    if (!sortedLots.length) return
    const at = sortedLots.findIndex((l) => l.lot_id === primaryId)
    const next = at === -1 ? sortedLots[dir > 0 ? 0 : sortedLots.length - 1] : sortedLots[at + dir]
    if (next) focusLot(next.lot_id)
  }

  const selectAll = () => {
    const ids = lots.filter((l) => !filter || l.status === filter).map((l) => l.lot_id)
    setSelected(ids)
    announce(`Selected ${ids.length} lot${ids.length === 1 ? '' : 's'}`)
  }

  // ---- pointer gestures -------------------------------------------------

  // Taking focus off a field commits it, and puts the arrow keys back on the
  // map rather than in whichever picker was used last.
  const focusMap = () => svgRef.current?.focus({ preventScroll: true })

  const onLotPointerDown = (e, lot) => {
    if (e.button !== 0) return
    e.stopPropagation()
    focusMap()
    const id = lot.lot_id
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
      return
    }
    const current = selectedRef.current
    const ids = current.includes(id) ? [...current.filter((x) => x !== id), id] : [id]
    setSelected(ids)
    if (locked) return
    gestureRef.current = {
      kind: 'move',
      client: { x: e.clientX, y: e.clientY },
      start: toSvg(e),
      armed: false,
      collapseTo: current.includes(id) && current.length > 1 ? id : null,
      orig: ids.map((x) => lotIndexRef.current.get(x)).filter(Boolean),
      last: [],
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onHandlePointerDown = (e, lot) => {
    if (e.button !== 0) return
    e.stopPropagation()
    focusMap()
    gestureRef.current = {
      kind: 'resize',
      client: { x: e.clientX, y: e.clientY },
      start: toSvg(e),
      armed: false,
      orig: [lot],
      last: [],
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  const onSvgPointerDown = (e) => {
    if (e.button !== 0) return
    focusMap()
    svgRef.current.setPointerCapture(e.pointerId)
    if (e.shiftKey) {
      const start = toSvg(e)
      gestureRef.current = { kind: 'marquee', start, client: { x: e.clientX, y: e.clientY }, armed: false }
      return
    }
    gestureRef.current = { kind: 'pan', client: { x: e.clientX, y: e.clientY }, vb: [...vbRef.current], armed: false }
  }

  const onPointerMove = (e) => {
    const g = gestureRef.current
    if (!g) return
    if (!g.armed) {
      if (Math.abs(e.clientX - g.client.x) + Math.abs(e.clientY - g.client.y) < DRAG_THRESHOLD_PX) return
      g.armed = true
    }
    if (g.kind === 'pan') {
      const rect = svgRef.current.getBoundingClientRect()
      const [x, y, w, h] = g.vb
      const s = Math.min(rect.width / w, rect.height / h)
      setVbBoth([x - (e.clientX - g.client.x) / s, y - (e.clientY - g.client.y) / s, w, h])
      return
    }
    const pt = toSvg(e)
    if (g.kind === 'marquee') {
      marqueeRef.current = {
        x: Math.min(g.start.x, pt.x),
        y: Math.min(g.start.y, pt.y),
        w: Math.abs(pt.x - g.start.x),
        h: Math.abs(pt.y - g.start.y),
      }
      setMarquee(marqueeRef.current)
      return
    }
    const dx = pt.x - g.start.x
    const dy = pt.y - g.start.y
    g.last = g.orig.map((lot) => ({ id: lot.lot_id, next: g.kind === 'move' ? moveBy(lot, dx, dy) : resizeBy(lot, dx, dy) }))
    setLocal(g.last)
  }

  const onPointerUp = () => {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g) return
    if (g.kind === 'pan') {
      if (!g.armed) setSelected([])
      return
    }
    if (g.kind === 'marquee') {
      const box = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (box && g.armed) {
        const hits = lots.filter((l) => overlaps(box, boxOf(l))).map((l) => l.lot_id)
        setSelected((cur) => [...cur.filter((id) => !hits.includes(id)), ...hits])
        announce(`${hits.length} lot${hits.length === 1 ? '' : 's'} added to the selection`)
      }
      return
    }
    if (!g.armed) {
      if (g.collapseTo != null) setSelected([g.collapseTo])
      return
    }
    const origById = new Map(g.orig.map((l) => [l.lot_id, l]))
    commit(
      g.last.map((c) => ({ id: c.id, prev: geometryOf(origById.get(c.id)), next: c.next })),
      { label: g.kind === 'move' ? (g.last.length > 1 ? `move of ${g.last.length} lots` : 'move') : 'resize' }
    )
  }

  // ---- keyboard ---------------------------------------------------------

  const nudge = (dx, dy, resize) => {
    if (!selectedLots.length) return
    if (locked) {
      announce('This section is locked; positions cannot change.')
      return
    }
    commit(
      selectedLots.map((l) => ({ id: l.lot_id, next: resize ? resizeBy(l, dx, dy) : moveBy(l, dx, dy) })),
      { label: resize ? 'resize' : 'nudge', delay: 400, coalesce: true }
    )
  }

  const keyRef = useRef(null)
  keyRef.current = (e) => {
    if (isEditableTarget(e.target)) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
      return
    }
    if (mod && key === 'a' && lots.length) {
      e.preventDefault()
      selectAll()
      return
    }
    if (mod && key === 'd') {
      e.preventDefault()
      addLot()
      return
    }
    if (mod) return
    if (e.key === 'Escape' && selected.length) {
      setSelected([])
      return
    }
    if (e.key === '[' || e.key === ']') {
      e.preventDefault()
      stepLot(e.key === ']' ? 1 : -1)
      return
    }
    const step = e.altKey ? 0.1 : 1
    const dir = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key]
    if (!dir || !selected.length) return
    e.preventDefault()
    nudge(dir[0], dir[1], e.shiftKey)
  }

  useEffect(() => {
    const onKey = (e) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- lot actions ------------------------------------------------------

  const addLot = async () => {
    if (!sectionRow || locked || busy) return
    const from = primaryLot
    const lotSize = from ? { w: from.svg_w, h: from.svg_h } : typical
    const at = placeNewLot({ area: plotArea(sectionRow, lots), lots, size: lotSize, from })
    setBusy(true)
    setError('')
    // No lot_code: the server allocates the next free one in the section's
    // surveyed sequence, because only the database sees every code in use.
    const { ok, data } = await api('/api/lots', {
      method: 'POST',
      body: {
        section_id: sectionId,
        block: from?.block ?? null,
        lot_type: from?.lot_type ?? 'single',
        price: Number(from?.price) || 0,
        status: 'available',
        description: '',
        svg_x: at.x,
        svg_y: at.y,
        svg_w: round2(lotSize.w),
        svg_h: round2(lotSize.h),
      },
    })
    setBusy(false)
    if (!ok) {
      setError(data?.error || 'Failed to add lot')
      return
    }
    updateSectionLots(sectionId, (list) => [...list, data])
    setSelected([data.lot_id])
    announce(`Added ${data.lot_code}`)
    setSaveState('saved')
  }

  const removeSelected = async () => {
    if (!selectedLots.length || locked) return
    setBusy(true)
    setError('')
    await flush()
    const results = []
    for (const lot of selectedLots) {
      const { ok, data } = await api(`/api/lots/${lot.lot_id}/delete`, { method: 'POST' })
      results.push({ lot, ok, error: data?.error })
    }
    setBusy(false)
    const gone = new Set(results.filter((r) => r.ok).map((r) => r.lot.lot_id))
    const kept = results.filter((r) => !r.ok)
    updateSectionLots(sectionId, (list) => list.filter((l) => !gone.has(l.lot_id)))
    setSelected(kept.map((r) => r.lot.lot_id))
    if (kept.length) {
      const names = kept.slice(0, 5).map((r) => r.lot.lot_code).join(', ')
      setError(
        kept.length === 1
          ? `${kept[0].lot.lot_code} was not deleted: ${kept[0].error || 'request failed'}`
          : `${gone.size} deleted. ${kept.length} kept (${names}${kept.length > 5 ? ', …' : ''}): they are linked to reservations or burial records.`
      )
    } else {
      announce(`Deleted ${gone.size} lot${gone.size === 1 ? '' : 's'}`)
    }
  }

  const reflow = async () => {
    if (sectionId == null) return
    setBusy(true)
    setError('')
    await flush()
    const { ok, data } = await api('/api/lots/regrid', { method: 'POST', body: { section_id: sectionId } })
    if (!ok) {
      setBusy(false)
      setError(data?.error || 'Reflow failed')
      return
    }
    const res = await api('/api/map')
    setBusy(false)
    if (res.ok) {
      setMapData(res.data)
      setSelected([])
      // Reflow sits outside Undo; stale steps would put single lots back
      // into a layout that no longer exists.
      undoRef.current = []
      redoRef.current = []
      bumpHistory()
      announce(`Reflowed ${data.updated} lots`)
    }
  }

  const editSelected = (patch, label) =>
    commit(selectedLots.map((l) => ({ id: l.lot_id, next: patch })), { label })

  const editGeometry = (lot, box) => commit([{ id: lot.lot_id, next: reshape(lot, { ...boxOf(lot), ...box }) }], { label: 'resize' })

  // ---- render -----------------------------------------------------------

  const handle = scale > 0 ? 10 / scale : 0
  const showLabels = scale * Math.min(typical.w, typical.h) >= 14
  const labelSize = scale > 0 ? Math.min(11 / scale, Math.min(typical.w, typical.h) * 0.55) : 0
  const outline = sectionRow ? plotArea(sectionRow, []) : null
  const statusText = {
    idle: 'All changes saved',
    pending: 'Unsaved changes…',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Some changes were not saved',
  }[saveState]

  return (
    <div className="map-page lot-editor">
      <div className="page-header">
        <h2>Lot Editor</h2>
        <div className="table-actions">
          <span className={`editor-dirty editor-dirty--${saveState}`} aria-live="polite">
            {saveState === 'saved' && <Icon name="check" size={14} />}
            {statusText}
          </span>
          <div className="lot-editor-history" role="group" aria-label="History">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={undo}
              disabled={!undoLabel}
              title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
            >
              <Icon name="undo" size={14} /> Undo
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={redo}
              disabled={!redoLabel}
              title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
            >
              <Icon name="redo" size={14} /> Redo
            </button>
          </div>
          {/* Redraws every lot in the section and is outside Undo, so it asks
              first: one stray click used to discard a hand-placed layout. */}
          <ConfirmButton
            label="Reflow grid"
            confirmLabel="Reflow"
            danger
            disabled={!sectionRow || locked || busy || lots.length === 0}
            busy={busy}
            message={`Redraw every lot in ${sectionRow?.section_name || 'this section'} as a grid? Hand-placed positions are lost and Undo cannot restore them.`}
            onConfirm={reflow}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={addLot}
            disabled={!sectionRow || locked || busy}
            title={primaryLot ? `Add a lot beside ${primaryLot.lot_code}, copying its size, type and price (Ctrl+D)` : 'Add a lot in the first free space (Ctrl+D)'}
          >
            <Icon name="plus" size={14} /> {primaryLot ? 'Add beside' : 'Add lot'}
          </button>
        </div>
      </div>

      <span className="visually-hidden" aria-live="polite">{announcement}</span>

      {error && (
        <div role="alert" className="alert alert--error lot-editor-error">
          <span>{error}</span>
          <button type="button" className="btn-ghost" onClick={() => setError('')} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {sectionRow && (
        <div className="lot-editor-bar">
          <div className="lot-editor-section">
            <button
              type="button"
              className="btn btn-secondary btn-sm lot-editor-step"
              onClick={() => stepSection(-1)}
              disabled={sectionIndex <= 0}
              aria-label="Previous section"
              title="Previous section"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <Combobox
              label="Section"
              value={sectionId}
              onChange={chooseSection}
              placeholder="Type a section name…"
              options={sections.map((s) => ({
                value: s.section_id,
                label: s.section_name,
                description: `${(s.lots || []).length} lots${s.is_locked ? ' · locked' : ''}`,
              }))}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm lot-editor-step"
              onClick={() => stepSection(1)}
              disabled={sectionIndex === -1 || sectionIndex >= sections.length - 1}
              aria-label="Next section"
              title="Next section"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>

          <div className="lot-editor-find">
            <Combobox
              label="Find a lot"
              value={selected.length === 1 ? primaryId : ''}
              onChange={focusLot}
              placeholder={`Code in ${sectionRow.section_name}…`}
              emptyText="No lot in this section has that code."
              options={sortedLots.map((l) => ({
                value: l.lot_id,
                label: l.lot_code,
                description: `${LOT_STATUS[l.status] || l.status}${l.block ? ` · Block ${l.block}` : ''}`,
              }))}
            />
          </div>

          <div className="lot-editor-filter" role="group" aria-label="Highlight lots by status">
            {PLOT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className="chip lot-editor-filter-chip"
                aria-pressed={filter === s}
                onClick={() => setFilter((f) => (f === s ? null : s))}
                title={filter === s ? 'Show every lot' : `Highlight ${LOT_STATUS[s].toLowerCase()} lots`}
              >
                <i className="dot" aria-hidden="true" style={{ background: STATUS_COLORS[s] }} />
                {LOT_STATUS[s]}
                <span className="chip-count">{counts[s]}</span>
              </button>
            ))}
          </div>

          <details className="lot-reference-align lot-editor-scan">
            <summary>Survey scan</summary>
            <div className="lot-reference-grid">
              <label className="lot-reference-toggle">
                <input
                  type="checkbox"
                  checked={reference.visible}
                  onChange={(e) => updateReference({ visible: e.target.checked })}
                />
                Show the scanned plan under the lots
              </label>
              <label className="lot-reference-opacity">
                Opacity
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={reference.opacity}
                  disabled={!reference.visible}
                  onChange={(e) => updateReference({ opacity: Number(e.target.value) })}
                />
                <output>{Math.round(reference.opacity * 100)}%</output>
              </label>
              {[
                ['Scale X', 'scaleX', 0.5, 1.5, 0.001],
                ['Scale Y', 'scaleY', 0.5, 1.5, 0.001],
                ['Rotation', 'rotation', -10, 10, 0.01],
                ['Offset X', 'offsetX', -800, 800, 1],
                ['Offset Y', 'offsetY', -800, 800, 1],
              ].map(([label, key, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={reference[key]}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber
                      if (Number.isFinite(value)) updateReference({ [key]: Math.min(max, Math.max(min, value)) })
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setReference({ ...DEFAULT_REFERENCE })
                  saveReference({ ...DEFAULT_REFERENCE })
                }}
              >
                Reset scan alignment
              </button>
              <p className="text-muted">Scan settings are kept in this browser only. Lot edits are saved to the database.</p>
            </div>
          </details>
        </div>
      )}

      {locked && (
        <p className="alert alert--warn alert--icon lot-editor-locked">
          <Icon name="lock" size={16} />
          <span>
            <b>{sectionRow.section_name} is locked.</b> Lots can't be moved, resized, added or deleted, but their
            details can still be edited. <Link to="/admin/sections">Unlock it in Sections</Link> to change the layout.
          </span>
        </p>
      )}

      {!mapData && !error && <p className="text-muted">Loading map…</p>}

      {mapData && (
        <div className="map-layout">
          <div className="map-svg-wrap">
            <svg
              ref={svgRef}
              className={`map-svg editor-svg${locked ? ' editor-svg--locked' : ''}`}
              viewBox={vb.join(' ')}
              preserveAspectRatio="xMidYMid meet"
              style={{ touchAction: 'none' }}
              tabIndex={0}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label={sectionRow ? `${sectionRow.section_name} plot layout` : 'Plot layout'}
            >
              <rect x={vb[0] - 200} y={vb[1] - 200} width={vb[2] + 400} height={vb[3] + 400} className="map-paper" />

              <MapReferenceImage reference={reference} width={MAP_VIEWBOX[2]} height={MAP_VIEWBOX[3]} />

              {sectionRow && (
                <g pointerEvents="none" className="lot-editor-outline">
                  {sectionRow.points ? (
                    <polygon points={sectionRow.points} vectorEffect="non-scaling-stroke" />
                  ) : (
                    outline && <rect x={outline.x} y={outline.y} width={outline.w} height={outline.h} vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              )}

              <g className="lot-editor-lots">
                {lots.map((lot) => {
                  const isSel = selectedSet.has(lot.lot_id)
                  const dim = filter && lot.status !== filter && !isSel
                  return (
                    <g
                      key={lot.lot_id}
                      className={`lot-editor-lot${dim ? ' lot-editor-lot--dim' : ''}`}
                      onPointerDown={(e) => onLotPointerDown(e, lot)}
                    >
                      <PlotShape
                        lot={lot}
                        className={isSel ? 'lot-shape lot--selected' : 'lot-shape'}
                        style={{ fill: STATUS_COLORS[lot.status] || 'var(--color-text-muted)' }}
                        fillOpacity={isSel ? 0.7 : 0.3}
                        stroke="#fff"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray={lot.status === 'reserved' && !isSel ? '4 3' : undefined}
                      />
                      {showLabels && (
                        <text
                          x={lot.svg_x + lot.svg_w / 2}
                          y={lot.svg_y + lot.svg_h / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="lot-label"
                          style={{ fontSize: `${labelSize}px`, strokeWidth: `${labelSize * 0.2}px` }}
                        >
                          {shortLabel(lot.lot_code)}
                        </text>
                      )}
                      <title>{`${lot.lot_code} · ${LOT_STATUS[lot.status] || lot.status} · ${money(lot.price)}`}</title>
                    </g>
                  )
                })}
              </g>

              {/* Drawn on the corner, half outside the plot, and sized in screen
                  pixels: a fixed 26-unit handle was wider than a 16-unit grave
                  and turned every drag of a selected lot into a resize. */}
              {primaryLot && selected.length === 1 && !locked && handle > 0 && (
                <g className="lot-editor-handle" onPointerDown={(e) => onHandlePointerDown(e, primaryLot)}>
                  <rect
                    x={primaryLot.svg_x + primaryLot.svg_w - handle}
                    y={primaryLot.svg_y + primaryLot.svg_h - handle}
                    width={handle * 2}
                    height={handle * 2}
                    fill="transparent"
                  />
                  <rect
                    x={primaryLot.svg_x + primaryLot.svg_w - handle * 0.4}
                    y={primaryLot.svg_y + primaryLot.svg_h - handle * 0.4}
                    width={handle * 0.8}
                    height={handle * 0.8}
                    className="lot-editor-handle-knob"
                    vectorEffect="non-scaling-stroke"
                  />
                  <title>Drag to resize</title>
                </g>
              )}

              {marquee && (
                <rect
                  className="lot-editor-marquee"
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.w}
                  height={marquee.h}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {sectionRow && lots.length === 0 && (
              <div className="editor-empty">
                No lots in this section yet. {locked ? 'Unlock the section to add some.' : <>Choose <b>Add lot</b> to place the first one.</>}
              </div>
            )}

            <ZoomControls
              onZoomIn={() => zoomCenter(1.5)}
              onZoomOut={() => zoomCenter(1 / 1.5)}
              onFit={() => fitSection()}
              fitLabel="Fit the section"
            />
          </div>

          <aside className="map-detail lot-editor-panel" aria-label="Lot details">
            {selectedLots.length === 0 && sectionRow && (
              <SectionPanel
                section={sectionRow}
                counts={counts}
                total={lots.length}
                filter={filter}
                onSelectAll={selectAll}
              />
            )}
            {selectedLots.length === 1 && (
              <LotPanel
                key={selectedLots[0].lot_id}
                lot={selectedLots[0]}
                locked={locked}
                busy={busy}
                onEdit={(patch, label) => editSelected(patch, label)}
                onGeometry={(box) => editGeometry(selectedLots[0], box)}
                onDelete={removeSelected}
                onDuplicate={addLot}
                onFocus={() => focusLot(selectedLots[0].lot_id)}
              />
            )}
            {selectedLots.length > 1 && (
              <BulkPanel
                lots={selectedLots}
                locked={locked}
                busy={busy}
                onEdit={(patch, label) => editSelected(patch, label)}
                onDelete={removeSelected}
                onClear={() => setSelected([])}
                onFrame={() => {
                  const framed = frameLots(selectedLots, { pad: 30 })
                  if (framed) flyTo(framed)
                }}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

// A text or number field that saves when you leave it or press Enter, and
// puts the saved value back on Escape. Saving on every keystroke would send a
// half-typed lot code to the uniqueness check.
function DraftField({ label, value, onCommit, type = 'text', required = false, placeholder, ...rest }) {
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)
  const skip = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value ?? '')
  }, [value])

  const commit = () => {
    const v = type === 'number' ? draft : String(draft).trim()
    if (v === '' && (required || type === 'number')) {
      setDraft(value ?? '')
      return
    }
    if (type === 'number' && !Number.isFinite(Number(v))) {
      setDraft(value ?? '')
      return
    }
    if (!sameValue(v, value)) onCommit(type === 'number' ? Number(v) : v)
  }

  return (
    <label>
      {label}
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          if (skip.current) {
            skip.current = false
            return
          }
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            skip.current = true
            setDraft(value ?? '')
            e.currentTarget.blur()
          }
        }}
        {...rest}
      />
    </label>
  )
}

function StatusChips({ value, onChange, labelId }) {
  return (
    <div className="editor-status-chips" role="group" aria-labelledby={labelId}>
      {PLOT_STATUSES.map((k) => {
        const active = value === k
        return (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={active}
            onClick={() => onChange(k)}
            style={{
              borderColor: STATUS_COLORS[k],
              ...(active ? { background: STATUS_COLORS[k], color: `var(--status-${k}-ink)` } : {}),
            }}
          >
            {LOT_STATUS[k]}
          </button>
        )
      })}
    </div>
  )
}

const STATUS_NOTE = 'Reservations and burial records set this as they are approved. Change it here only to correct a record.'

function SectionPanel({ section, counts, total, filter, onSelectAll }) {
  return (
    <div className="lot-editor-panel-body">
      <h3>{section.section_name}</h3>
      <p className="text-muted">
        {total} lot{total === 1 ? '' : 's'}
        {section.is_locked ? ' · locked' : ''}
      </p>
      <dl className="lot-editor-counts">
        {PLOT_STATUSES.map((s) => (
          <div key={s}>
            <dt>
              <i className="dot" aria-hidden="true" style={{ background: STATUS_COLORS[s] }} /> {LOT_STATUS[s]}
            </dt>
            <dd>{counts[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="lot-editor-tip">
        Select a lot on the map to edit it. Shift+click or Shift+drag selects several, to price or move them together.
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onSelectAll} disabled={total === 0}>
        {filter ? `Select all ${LOT_STATUS[filter].toLowerCase()}` : 'Select all lots'}
      </button>
      <details className="lot-editor-keys">
        <summary>Keyboard and mouse</summary>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}

function LotPanel({ lot, locked, busy, onEdit, onGeometry, onDelete, onDuplicate, onFocus }) {
  return (
    <div className="lot-editor-panel-body">
      <div className="lot-editor-panel-head">
        <h3>Lot {lot.lot_code}</h3>
        <button type="button" className="btn-ghost lot-editor-link" onClick={onFocus}>
          Zoom to lot
        </button>
      </div>
      <p className="text-muted lot-editor-autosave">Changes save when you leave a field.</p>

      <div className="editor-form-grid">
        <DraftField label="Lot code" value={lot.lot_code} required maxLength="20" onCommit={(v) => onEdit({ lot_code: v }, 'lot code change')} />
        <DraftField label="Block" value={lot.block ?? ''} maxLength="20" placeholder="e.g. A-1" onCommit={(v) => onEdit({ block: v || null }, 'block change')} />
        <Select
          label="Type"
          value={lot.lot_type}
          onChange={(v) => onEdit({ lot_type: v }, 'type change')}
          options={LOT_TYPES.map((t) => ({ value: t, label: LOT_TYPE_LABELS[t] }))}
        />
        <DraftField label="Price (₱)" type="number" min="0" step="0.01" value={lot.price} onCommit={(v) => onEdit({ price: Math.max(0, v) }, 'price change')} />
      </div>

      <p className="editor-block-label" id="lot-status-label">Status</p>
      <StatusChips value={lot.status} labelId="lot-status-label" onChange={(s) => onEdit({ status: s }, 'status change')} />
      <p className="lot-editor-note">{STATUS_NOTE}</p>

      <div className="editor-block-label">
        <DraftField label="Description" value={lot.description ?? ''} placeholder="Optional notes" onCommit={(v) => onEdit({ description: v || null }, 'description change')} />
      </div>

      <fieldset className="lot-editor-geometry" disabled={locked}>
        <legend>Position and size</legend>
        <div className="lot-editor-geometry-grid">
          <DraftField label="X" type="number" step="0.01" min="0" value={lot.svg_x} onCommit={(v) => onGeometry({ x: v })} />
          <DraftField label="Y" type="number" step="0.01" min="0" value={lot.svg_y} onCommit={(v) => onGeometry({ y: v })} />
          <DraftField label="Width" type="number" step="0.01" min="4" value={lot.svg_w} onCommit={(v) => onGeometry({ w: v })} />
          <DraftField label="Height" type="number" step="0.01" min="4" value={lot.svg_h} onCommit={(v) => onGeometry({ h: v })} />
        </div>
        {lot.svg_points && <p className="lot-editor-note">Traced outline: it moves and stretches with the box.</p>}
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate} disabled={locked || busy}>
          <Icon name="copy" size={14} /> Add beside
        </button>
        <ConfirmButton
          label="Delete"
          danger
          disabled={locked}
          onConfirm={onDelete}
          busy={busy}
          message={`Delete ${lot.lot_code}? Only allowed while it has no reservations or burial records.`}
        />
      </div>
    </div>
  )
}

const common = (lots, key) => {
  const first = lots[0]?.[key] ?? null
  return lots.every((l) => sameValue(l[key] ?? null, first)) ? first : undefined
}

function BulkPanel({ lots, locked, busy, onEdit, onDelete, onClear, onFrame }) {
  const n = lots.length
  const type = common(lots, 'lot_type')
  const price = common(lots, 'price')
  const block = common(lots, 'block')
  const status = common(lots, 'status')
  const [priceDraft, setPriceDraft] = useState('')
  const [blockDraft, setBlockDraft] = useState('')
  const codes = [...lots].sort(byCode).map((l) => l.lot_code)
  const tally = PLOT_STATUSES.map((s) => [s, lots.filter((l) => l.status === s).length]).filter(([, c]) => c > 0)

  const applyPrice = (e) => {
    e.preventDefault()
    const v = Number(priceDraft)
    if (priceDraft === '' || !Number.isFinite(v) || v < 0) return
    onEdit({ price: v }, `price change on ${n} lots`)
    setPriceDraft('')
  }

  const applyBlock = (e) => {
    e.preventDefault()
    onEdit({ block: blockDraft.trim() || null }, `block change on ${n} lots`)
    setBlockDraft('')
  }

  return (
    <div className="lot-editor-panel-body">
      <div className="lot-editor-panel-head">
        <h3>{n} lots selected</h3>
        <button type="button" className="btn-ghost lot-editor-link" onClick={onFrame}>
          Zoom to selection
        </button>
      </div>
      <p className="text-muted lot-editor-codes" title={codes.join(', ')}>
        {codes.slice(0, 6).join(', ')}
        {n > 6 ? ` and ${n - 6} more` : ''}
      </p>
      <p className="text-muted">{tally.map(([s, c]) => `${c} ${LOT_STATUS[s].toLowerCase()}`).join(' · ')}</p>

      <p className="lot-editor-tip">Changes here apply to every selected lot. Drag one of them, or use the arrow keys, to move them together.</p>

      <Select
        label="Type"
        value={type ?? ''}
        placeholder="Mixed types"
        onChange={(v) => onEdit({ lot_type: v }, `type change on ${n} lots`)}
        options={LOT_TYPES.map((t) => ({ value: t, label: LOT_TYPE_LABELS[t] }))}
      />

      <form className="lot-editor-apply" onSubmit={applyPrice}>
        <label>
          Price (₱)
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceDraft}
            placeholder={price !== undefined ? money(price) : 'Mixed prices'}
            onChange={(e) => setPriceDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={priceDraft === ''}>
          Set price
        </button>
      </form>

      <form className="lot-editor-apply" onSubmit={applyBlock}>
        <label>
          Block
          <input
            value={blockDraft}
            maxLength="20"
            placeholder={block === undefined ? 'Mixed blocks' : block || 'No block'}
            onChange={(e) => setBlockDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          {blockDraft.trim() ? 'Set block' : 'Clear block'}
        </button>
      </form>

      <p className="editor-block-label" id="bulk-status-label">Status</p>
      <StatusChips value={status} labelId="bulk-status-label" onChange={(s) => onEdit({ status: s }, `status change on ${n} lots`)} />
      <p className="lot-editor-note">{STATUS_NOTE}</p>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear selection
        </button>
        <ConfirmButton
          label={`Delete ${n}`}
          danger
          disabled={locked}
          busy={busy}
          onConfirm={onDelete}
          message={`Delete ${n} lots? Any linked to reservations or burial records are kept.`}
        />
      </div>
    </div>
  )
}
