import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import { useAuth } from '../context/AuthContext'
import CemeterySvgMap, { sectionColor } from '../components/CemeterySvgMap'
import Loading from '../components/Loading'
import PlotPicker, { STATUS_LABELS } from '../components/PlotPicker'
import { nearestSection } from '../lib/sections'
import { BURIAL_TYPES, INTERMENT_STATUS, LOT_TYPES, label, lifespan, longDate } from '../lib/terms'

export default function Cemetery() {
  const { user } = useAuth()
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const [viewSectionId, setViewSectionId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const lotParam = searchParams.get('lot')
  // The map reframes itself on whatever a search matched, so it follows the
  // settled query rather than every keystroke.
  const query = useDebounced(search.trim())

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (ok) setMapData(data)
      else setError(data?.error || 'Failed to load map data')
    })
  }, [])

  // Tabs, counts and the map all follow the active filter. The linked plot is
  // excepted: a ?lot= deep link has to show what it points at even when the
  // filter would otherwise hide it.
  const sections = useMemo(() => {
    if (!mapData) return []
    const q = query.toLowerCase()
    return mapData.sections.map((s) => ({
      ...s,
      lots: (s.lots || []).filter((l) => {
        const linked = lotParam !== null && String(l.lot_id) === lotParam
        const passesStatus = filterStatus === 'all' || l.status === filterStatus
        const passesSearch = !q || l.lot_code.toLowerCase().includes(q)
        return linked || (passesStatus && passesSearch)
      }),
    }))
  }, [mapData, filterStatus, query, lotParam])

  // Selection reads from the unfiltered set: a filtered-out lot must still be
  // reachable, or a ?lot= link stops working the moment someone sets a filter.
  const allLots = useMemo(
    () => (mapData?.sections || []).flatMap((s) => s.lots || []),
    [mapData]
  )

  const selectedLot = useMemo(
    () => (lotParam ? allLots.find((l) => String(l.lot_id) === lotParam) || null : null),
    [allLots, lotParam]
  )

  // The interment record filed against the selected plot. /api/burial-records is
  // staff and admin only, and the map itself is public -- so this is fetched
  // only for those roles. A public map must not disclose who lies in a plot.
  const [interment, setInterment] = useState(null)
  const [intermentLoading, setIntermentLoading] = useState(false)
  const canSeeInterments = user?.role === 'staff' || user?.role === 'admin'

  useEffect(() => {
    if (!canSeeInterments || !selectedLot) {
      setInterment(null)
      return undefined
    }
    let current = true
    setIntermentLoading(true)
    api(`/api/burial-records?lot_id=${selectedLot.lot_id}`)
      .then(({ ok, data }) => {
        if (!current) return
        setInterment(ok && Array.isArray(data) && data.length ? data[0] : null)
      })
      .finally(() => current && setIntermentLoading(false))
    return () => { current = false }
  }, [canSeeInterments, selectedLot])

  // Sections in words: a first-time visitor cannot be expected to find
  // "Section 42" on the plan unaided.
  const nearSection = useMemo(() => {
    if (!selectedLot || !mapData) return null
    const own = mapData.sections.find((s) => String(s.section_id) === String(selectedLot.section_id))
    return nearestSection(own, mapData.sections)
  }, [selectedLot, mapData])

  const compositeLots = useMemo(() => (sections || []).flatMap((s) => s.lots || []), [sections])
  const compositeCounts = useMemo(() => {
    const counts = { available: 0, reserved: 0, occupied: 0 }
    compositeLots.forEach((l) => {
      if (counts[l.status] !== undefined) counts[l.status]++
    })
    return counts
  }, [compositeLots])

  // The URL is the source of truth for selection, so ?lot= is shareable and
  // the back button works. A selected lot also wins the section, because the
  // plot would be a speck in the overview until you clicked through to it.
  // Derived rather than synced in an effect so a deep link lands on the right
  // section on the very first render. A section the search has emptied is left
  // behind: the matches are elsewhere, and framing them inside a section that
  // dims everything but itself would bury the very thing that was searched for.
  const activeSection = useMemo(() => {
    const id = selectedLot ? selectedLot.section_id : viewSectionId
    if (id === undefined || id === null) return null
    const section = sections.find((s) => String(s.section_id) === String(id))
    if (!section || (query && section.lots.length === 0)) return null
    return section
  }, [sections, selectedLot, viewSectionId, query])

  // The plots the map is framing, exposed as a keyboard-operable list. The SVG
  // plots answer only to a pointer (click handled on the map root), so a list of
  // buttons is how a keyboard or screen-reader user selects one. It mirrors the
  // active section, or the search matches when browsing across sections, so the
  // two never disagree. PlotPicker caps the rows; the search box above narrows.
  const listedLots = activeSection ? activeSection.lots || [] : query ? compositeLots : []

  const selectLot = (lot) => {
    const next = lot ? String(lot.lot_id) : null
    if (next === lotParam) return
    setSearchParams(next ? { lot: next } : {}, { replace: true })
  }

  const focusSection = (section) => {
    setViewSectionId(section.section_id)
    selectLot(null)
  }

  const showAll = () => {
    setViewSectionId(null)
    selectLot(null)
  }

  const recordLinks = user
    ? user.role === 'user'
      ? [{ to: '/visitor/reservations', label: 'My reservations' }]
      : [
          { to: `/${user.role}/reservations`, label: 'Reservations' },
          { to: `/${user.role}/burial-records`, label: 'Burial records' },
        ]
    : []

  const lotQuery = selectedLot ? `?q=${encodeURIComponent(selectedLot.lot_code)}` : ''

  return (
    <div className="map-page">
      <h2>Cemetery Map</h2>
      <p className="text-muted map-intro">
        Choose a section to zoom in, then tap a plot to see its details. Plots marked Available can be reserved.
      </p>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!mapData && !error && <Loading message="Loading map..." />}

      {mapData && (
        <div className="map-panes">
          <aside className="map-rail" aria-label="Map controls">
            <div className="map-rail-group">
              <p className="panel-heading">Sections</p>
              <div className="map-tabs">
                <button
                  type="button"
                  className={!activeSection ? 'map-tab map-tab--active' : 'map-tab'}
                  onClick={showAll}
                  aria-pressed={!activeSection}
                >
                  Overview
                </button>
                {sections.map((s) => (
                  <button
                    key={s.section_id}
                    type="button"
                    className={activeSection?.section_id === s.section_id ? 'map-tab map-tab--active' : 'map-tab'}
                    onClick={() => focusSection(s)}
                    aria-pressed={activeSection?.section_id === s.section_id}
                  >
                    <i className="dot" aria-hidden="true" style={{ background: sectionColor(s.section_id) }} />
                    {s.section_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-rail-group">
              <p className="panel-heading">Filter</p>
              <input
                className="search-input map-search"
                type="search"
                aria-label="Search plots by lot code"
                placeholder="Search lot code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="map-filters">
                {['all', 'available', 'reserved', 'occupied'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={filterStatus === status ? 'chip chip--active' : 'chip'}
                    onClick={() => setFilterStatus(status)}
                    aria-pressed={filterStatus === status}
                  >
                    {status === 'all' ? 'All Lots' : STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-rail-group">
              <p className="panel-heading" id="plots-list-heading">
                {activeSection ? `${activeSection.section_name} plots` : 'Matching plots'}
              </p>
              <PlotPicker
                lots={listedLots}
                selectedId={lotParam}
                onSelect={selectLot}
                labelledBy="plots-list-heading"
                emptyMessage="Choose a section or search a lot code to list its plots here."
                showSection={!activeSection}
              />
            </div>

            <div className="map-rail-group map-rail-legend">
              <p className="panel-heading">Legend</p>
              <div className="map-legend">
                <span><i className="swatch swatch--available" aria-hidden="true" /> Available ({compositeCounts.available})</span>
                <span><i className="swatch swatch--reserved" aria-hidden="true" /> Reserved ({compositeCounts.reserved})</span>
                <span><i className="swatch" aria-hidden="true" /> Occupied ({compositeCounts.occupied})</span>
                {search && <span className="text-muted">{compositeLots.length} matching</span>}
              </div>
              <p className="text-muted map-toggle-note">
                The whole-cemetery view shows available plots only. Zoom in to see reserved and occupied ones.
              </p>
            </div>
          </aside>

          <div className="map-layout">
            <CemeterySvgMap
              sections={sections}
              contextLots={allLots}
              activeSection={activeSection}
              selectedLotId={selectedLot?.lot_id}
              query={query}
              onSelectLot={selectLot}
              onFocusSection={focusSection}
              onExitSection={showAll}
              onClearSearch={() => setSearch('')}
            />

            <aside className="map-detail" aria-label="Plot details">
              {selectedLot ? (
                <>
                  {/* The plot's own entry: titled, ruled, filed. */}
                  <div className="plot-doc">
                    <div className="plot-doc-head">
                      <h3>{selectedLot.lot_code}</h3>
                      <span className={`mark mark--${selectedLot.status}`}>
                        {STATUS_LABELS[selectedLot.status] || selectedLot.status}
                      </span>
                    </div>
                    <dl className="figure-list">
                      <div>
                        <dt>Section</dt>
                        <dd>{selectedLot.section_name}{nearSection && `, near ${nearSection.section_name}`}</dd>
                      </div>
                      <div><dt>Block</dt><dd>{selectedLot.block || '—'}</dd></div>
                      <div><dt>Type</dt><dd>{label(LOT_TYPES, selectedLot.lot_type)}</dd></div>
                      <div><dt>Price</dt><dd>₱{Number(selectedLot.price).toLocaleString()}</dd></div>
                    </dl>
                  </div>
                  {selectedLot.status === 'available' &&
                    (user ? (
                      <Link
                        to={`/visitor/reserve?lot=${selectedLot.lot_id}`}
                        className="btn btn-primary btn-block"
                      >
                        Reserve this plot
                      </Link>
                    ) : (
                      <Link
                        to="/login"
                        state={{ from: { pathname: '/visitor/reserve', search: `?lot=${selectedLot.lot_id}` } }}
                        className="btn btn-primary btn-block"
                      >
                        Sign in to reserve
                      </Link>
                    ))}
                  {selectedLot.status !== 'available' && (
                    <p className="text-muted map-hint">This plot is currently {STATUS_LABELS[selectedLot.status].toLowerCase()}.</p>
                  )}

                  {recordLinks.length > 0 && (
                    <div className="detail-records">
                      <p className="panel-heading">Records</p>
                      <div className="detail-links">
                        {recordLinks.map((l) => (
                          <Link key={l.to} to={`${l.to}${lotQuery}`}>
                            {l.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* The interment record, printed inside the plot's own entry.
                      Staff and admin only -- see the fetch above. */}
                  {canSeeInterments && (
                    <div className="plot-doc plot-doc--filed">
                      <p className="plot-doc-label">Interment record</p>
                      {intermentLoading && <p className="text-muted">Checking the register…</p>}
                      {!intermentLoading && interment && (
                        <>
                          <p className="plot-doc-name">{interment.deceased_fullname}</p>
                          {(interment.date_of_birth || interment.date_of_death) && (
                            <p className="plot-doc-years">{lifespan(interment.date_of_birth, interment.date_of_death)}</p>
                          )}
                          <dl className="figure-list">
                            <div><dt>Interred</dt><dd>{longDate(interment.burial_date)}</dd></div>
                            <div><dt>Type</dt><dd>{label(BURIAL_TYPES, interment.burial_type)}</dd></div>
                            <div>
                              <dt>State</dt>
                              <dd>
                                <span className={`mark mark--${interment.interment_status}`}>
                                  {label(INTERMENT_STATUS, interment.interment_status)}
                                </span>
                              </dd>
                            </div>
                            {interment.next_of_kin_name && (
                              <div>
                                <dt>Next of kin</dt>
                                <dd>{interment.next_of_kin_name}</dd>
                              </div>
                            )}
                          </dl>
                        </>
                      )}
                      {!intermentLoading && !interment && (
                        <p className="text-muted">No interment is filed against this plot.</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>Plot details</h3>
                  <p className="text-muted map-hint">
                    Select a plot on the map to see its record.
                  </p>
                  {!user && (
                    <p className="text-muted map-hint">
                      <Link to="/login">Sign in</Link> to reserve an available plot.
                    </p>
                  )}
                </>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
