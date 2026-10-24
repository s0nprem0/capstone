import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import useMediaQuery from '../lib/useMediaQuery'
import { useAuth } from '../context/AuthContext'
import CemeterySvgMap, { sectionColor } from '../components/CemeterySvgMap'
import Loading from '../components/Loading'
import MapSearch from '../components/MapSearch'
import PlotPicker from '../components/PlotPicker'
import PlotOwners from '../components/PlotOwners'
import Select from '../components/Select'
import Blank from '../components/Blank'
import { nearestSection } from '../lib/sections'
import { BURIAL_TYPES, INTERMENT_STATUS, LOT_STATUS, LOT_TYPES, label, lifespan, longDate, money } from '../lib/terms'

// Share of the map a phone's plot sheet can cover once the map is scrolled to
// the top of the screen: the sheet is at most 48% of the screen, the map 70%.
// A chosen plot is brought into the part still showing.
const SHEET_COVER = 0.3

// Names are looked up on the server; shorter than this matches half the register.
const NAME_MIN = 3
const NO_PEOPLE = []

export default function Cemetery() {
  const { user } = useAuth()
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const [viewSectionId, setViewSectionId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [sectionFind, setSectionFind] = useState('')
  const lotParam = searchParams.get('lot')
  // Phones get a dropdown for sections, a folded plot list and a sheet for the
  // plot's record: three stacked panes left the map a 270px strip.
  const phone = useMediaQuery('(max-width: 768px)')
  const layoutRef = useRef(null)
  // One box finds a loved one by name or a plot by its code. The map reframes
  // itself on whatever a search matched, so it follows the settled query, and
  // the names come back from the server -- the plot codes and the names land
  // together, or the map would flash "nothing matches" while a name is in flight.
  const typed = useDebounced(search.trim())
  const [match, setMatch] = useState({ query: typed, people: [] })
  useEffect(() => {
    if (typed.length < NAME_MIN) {
      setMatch({ query: typed, people: NO_PEOPLE })
      return undefined
    }
    let current = true
    api(`/api/memorials?q=${encodeURIComponent(typed)}`).then(({ ok, data }) => {
      if (current) setMatch({ query: typed, people: ok && Array.isArray(data) ? data : [] })
    })
    return () => { current = false }
  }, [typed])
  const { query, people } = match
  const graves = useMemo(() => new Set(people.map((p) => String(p.lot_id))), [people])

  // Re-run after recording an owner here: that takes the plot off the market,
  // and the mutation has already dropped the cached map.
  const loadMap = () =>
    api('/api/map').then(({ ok, data }) => {
      if (ok) setMapData(data)
      else setError(data?.error || 'Failed to load map data')
    })

  useEffect(() => {
    loadMap()
  }, [])

  // Tabs, counts and the map all follow the active filter. The linked plot is
  // excepted: a ?lot= deep link has to show what it points at even when the
  // filter would otherwise hide it. So is a grave found by name: whoever typed
  // it is looking for that person, not for plots of some status.
  const sections = useMemo(() => {
    if (!mapData) return []
    const q = query.toLowerCase()
    return mapData.sections.map((s) => ({
      ...s,
      lots: (s.lots || []).filter((l) => {
        const linked = lotParam !== null && String(l.lot_id) === lotParam
        if (linked || graves.has(String(l.lot_id))) return true
        const passesStatus = filterStatus === 'all' || l.status === filterStatus
        const passesSearch = !q || l.lot_code.toLowerCase().includes(q)
        return passesStatus && passesSearch
      }),
    }))
  }, [mapData, filterStatus, query, lotParam, graves])

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

  // The interment records filed against the selected plot -- a family plot
  // holds several. /api/burial-records is staff and admin only, and the map
  // itself is public -- so this is fetched only for those roles. A public map
  // must not disclose next of kin.
  const [interments, setInterments] = useState([])
  const [intermentLoading, setIntermentLoading] = useState(false)
  const canSeeInterments = user?.role === 'staff' || user?.role === 'admin'

  useEffect(() => {
    if (!canSeeInterments || !selectedLot) {
      setInterments([])
      return undefined
    }
    let current = true
    setIntermentLoading(true)
    api(`/api/burial-records?lot_id=${selectedLot.lot_id}`)
      .then(({ ok, data }) => {
        if (!current) return
        setInterments(ok && Array.isArray(data) ? data : [])
      })
      .finally(() => current && setIntermentLoading(false))
    return () => { current = false }
  }, [canSeeInterments, selectedLot])

  // Everyone else -- the public and visitors -- sees who rests in the plot,
  // as its headstone would say it: the name and the date of death, never the
  // next of kin. A plot still available has no one to look up.
  const [memorials, setMemorials] = useState([])
  useEffect(() => {
    if (canSeeInterments || !selectedLot || selectedLot.status === 'available') {
      setMemorials([])
      return undefined
    }
    let current = true
    api(`/api/lots/${selectedLot.lot_id}/memorials`).then(({ ok, data }) => {
      if (current) setMemorials(ok && Array.isArray(data) ? data : [])
    })
    return () => { current = false }
  }, [canSeeInterments, selectedLot])

  // Sections in words: a first-time visitor cannot be expected to find
  // "Section 42" on the plan unaided.
  const nearSection = useMemo(() => {
    if (!selectedLot || !mapData) return null
    const own = mapData.sections.find((s) => String(s.section_id) === String(selectedLot.section_id))
    return nearestSection(own, mapData.sections)
  }, [selectedLot, mapData])

  // Matched on the name or its bare number, so "4" finds Section 4 before the
  // ten other sections that merely contain a 4.
  const shownSections = useMemo(() => {
    const q = sectionFind.trim().toLowerCase()
    if (!q) return sections
    const matches = sections.filter((s) => s.section_name.toLowerCase().includes(q))
    const exact = (s) => s.section_name.toLowerCase().replace(/^section\s+/, '') === q
    return [...matches.filter(exact), ...matches.filter((s) => !exact(s))]
  }, [sections, sectionFind])

  const totalAvailable = useMemo(
    () => (mapData?.sections || []).reduce((sum, s) => sum + (s.counts?.available || 0), 0),
    [mapData]
  )

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

  const showSearch = query.length >= NAME_MIN

  // One person found and nothing else matched: open their grave straight away.
  // A lone match is only a faint tint on the map until it is selected, and the
  // family should not have to hunt for it a second time.
  useEffect(() => {
    if (people.length === 1 && compositeLots.length === 1) selectLot(people[0])
  }, [people]) // eslint-disable-line react-hooks/exhaustive-deps

  // On a phone the map is taller than what is left of the screen once its
  // record slides up, so bring the map to the top: the plot then shows above
  // the sheet rather than under it.
  const selectedId = selectedLot?.lot_id
  useEffect(() => {
    if (!phone || selectedId == null) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    layoutRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [phone, selectedId])

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
      <div className="map-head">
        <h2>Cemetery Map</h2>
        {mapData && (
          <MapSearch
            value={search}
            onChange={setSearch}
            people={showSearch ? people : NO_PEOPLE}
            onChoose={selectLot}
            selectedId={lotParam}
          />
        )}
      </div>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!mapData && !error && <Loading message="Loading map..." />}

      {mapData && (
        <div className="map-panes">
          <aside className="map-rail" aria-label="Map controls">
            <div className="map-rail-group map-rail-sections">
              <p className="panel-heading section-list-heading" id="sections-heading">
                Sections <span aria-hidden="true">Available</span>
              </p>
              <div className="map-section-select">
                <Select
                  ariaLabel="Section"
                  value={activeSection ? String(activeSection.section_id) : ''}
                  onChange={(value) => {
                    const section = sections.find((s) => String(s.section_id) === value)
                    if (section) focusSection(section)
                    else showAll()
                  }}
                  options={[
                    { value: '', label: 'Whole cemetery' },
                    ...sections.map((s) => ({
                      value: String(s.section_id),
                      label: s.section_name,
                      description: s.counts ? `${s.counts.available} available` : undefined,
                    })),
                  ]}
                />
              </div>
              <input
                className="search-input section-find"
                type="search"
                aria-label="Find a section"
                placeholder="Find section…"
                value={sectionFind}
                onChange={(e) => setSectionFind(e.target.value)}
              />
              <ul className="section-list" aria-labelledby="sections-heading">
                {!sectionFind.trim() && (
                  <li>
                    <button
                      type="button"
                      className={!activeSection ? 'section-row section-row--active' : 'section-row'}
                      onClick={showAll}
                      aria-pressed={!activeSection}
                    >
                      <span className="section-row-name">All sections</span>
                      <span className="section-row-count" title="Plots available">{totalAvailable.toLocaleString()}</span>
                    </button>
                  </li>
                )}
                {shownSections.map((s) => {
                  const active = activeSection?.section_id === s.section_id
                  const free = s.counts?.available || 0
                  const total = free + (s.counts?.reserved || 0) + (s.counts?.occupied || 0)
                  return (
                    <li key={s.section_id}>
                      <button
                        type="button"
                        className={active ? 'section-row section-row--active' : 'section-row'}
                        onClick={() => focusSection(s)}
                        aria-pressed={active}
                        aria-label={`${s.section_name}, ${free} of ${total} plots available`}
                      >
                        <i className="dot" aria-hidden="true" style={{ background: sectionColor(s.section_id) }} />
                        <span className="section-row-name">{s.section_name}</span>
                        <span
                          className={free ? 'section-row-count' : 'section-row-count section-row-count--full'}
                          title="Plots available"
                        >
                          {free || 'Full'}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {shownSections.length === 0 && <li className="text-muted section-list-empty">No section matches.</li>}
              </ul>
            </div>

            <div className="map-rail-group map-rail-filter">
              <p className="panel-heading">Show plots</p>
              <div className="map-filters">
                {['all', 'available', 'reserved', 'occupied'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={filterStatus === status ? 'chip chip--active' : 'chip'}
                    onClick={() => setFilterStatus(status)}
                    aria-pressed={filterStatus === status}
                  >
                    {status === 'all' ? 'All Lots' : LOT_STATUS[status]}
                  </button>
                ))}
              </div>
            </div>

            {/* Folded on a phone, where it would push the map off screen; it stays
                the way to pick a plot by keyboard or screen reader. */}
            <details className="map-rail-group map-plots" open={!phone || undefined}>
              <summary className="panel-heading" id="plots-list-heading">
                {activeSection ? `${activeSection.section_name} plots` : 'Matching plots'}
              </summary>
              <PlotPicker
                lots={listedLots}
                selectedId={lotParam}
                onSelect={selectLot}
                labelledBy="plots-list-heading"
                emptyMessage="Choose a section, or search above, to list plots here."
                showSection={!activeSection}
              />
            </details>

            <div className="map-rail-group map-rail-legend">
              <p className="panel-heading">Legend</p>
              <div className="map-legend">
                <span><i className="swatch swatch--available" aria-hidden="true" /> Available ({compositeCounts.available})</span>
                <span><i className="swatch swatch--reserved" aria-hidden="true" /> Reserved ({compositeCounts.reserved})</span>
                <span><i className="swatch swatch--occupied" aria-hidden="true" /> Occupied ({compositeCounts.occupied})</span>
                {search && <span className="text-muted">{compositeLots.length} matching</span>}
              </div>
              <p className="text-muted map-toggle-note">
                Hover a plot for its code and price; click it for the full record.
              </p>
            </div>
          </aside>

          <div className="map-layout" ref={layoutRef}>
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">
              {selectedLot
                ? `Plot ${selectedLot.lot_code}, ${LOT_STATUS[selectedLot.status] || selectedLot.status}, ${money(selectedLot.price)}.`
                : ''}
            </p>
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
              coverBottom={phone && selectedLot ? SHEET_COVER : 0}
            />

            <aside className={`map-detail${selectedLot ? ' map-detail--open' : ''}`} aria-label="Plot details">
              {selectedLot && (
                <>
                  <button type="button" className="sheet-close" onClick={() => selectLot(null)} aria-label="Close plot details">
                    ×
                  </button>
                  {/* The plot's own entry: titled, ruled, filed. */}
                  <div className="plot-doc">
                    <div className="plot-doc-head">
                      <h3>{selectedLot.lot_code}</h3>
                      <span className={`mark mark--${selectedLot.status}`}>
                        {LOT_STATUS[selectedLot.status] || selectedLot.status}
                      </span>
                    </div>
                    <dl className="figure-list">
                      <div>
                        <dt>Section</dt>
                        <dd>{selectedLot.section_name}{nearSection && `, near ${nearSection.section_name}`}</dd>
                      </div>
                      <div><dt>Block</dt><dd>{selectedLot.block || <Blank>Not set</Blank>}</dd></div>
                      <div><dt>Type</dt><dd>{label(LOT_TYPES, selectedLot.lot_type)}</dd></div>
                      <div><dt>Price</dt><dd>{money(selectedLot.price)}</dd></div>
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
                    <p className="text-muted map-hint">This plot is currently {LOT_STATUS[selectedLot.status].toLowerCase()}.</p>
                  )}

                  {memorials.length > 0 && (
                    <div className="plot-doc plot-doc--filed">
                      <p className="plot-doc-label">In loving memory</p>
                      {memorials.map((m) => (
                        <div key={m.deceased_fullname} className="plot-doc-memorial">
                          <p className="plot-doc-name">{m.deceased_fullname}</p>
                          {m.date_of_death && <p className="plot-doc-years">Died {longDate(m.date_of_death)}</p>}
                        </div>
                      ))}
                    </div>
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

                  {/* The interment records, printed inside the plot's own entry.
                      Staff and admin only -- see the fetch above. */}
                  {canSeeInterments && (
                    <div className="plot-doc plot-doc--filed">
                      <p className="plot-doc-label">{interments.length > 1 ? `Interment records (${interments.length})` : 'Interment record'}</p>
                      {intermentLoading && <p className="text-muted">Checking the register…</p>}
                      {!intermentLoading && interments.map((interment) => (
                        <div key={interment.burial_id} className="plot-interment">
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
                        </div>
                      ))}
                      {!intermentLoading && interments.length === 0 && (
                        <p className="text-muted">No interment is filed against this plot.</p>
                      )}
                    </div>
                  )}

                  {canSeeInterments && (
                    <PlotOwners lot={selectedLot} isAdmin={user.role === 'admin'} onChanged={loadMap} />
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
