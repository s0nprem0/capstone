import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import CemeterySvgMap, { STATUS_COLORS } from '../components/CemeterySvgMap'
import Loading from '../components/Loading'

const STATUS_LABELS = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
}

export default function Cemetery() {
  const { user } = useAuth()
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const [viewSectionId, setViewSectionId] = useState(null)
  const [showLayout, setShowLayout] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const lotParam = searchParams.get('lot')

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
    const q = search.trim().toLowerCase()
    return mapData.sections.map((s) => ({
      ...s,
      lots: (s.lots || []).filter((l) => {
        const linked = lotParam !== null && String(l.lot_id) === lotParam
        const passesStatus = filterStatus === 'all' || l.status === filterStatus
        const passesSearch = !q || l.lot_code.toLowerCase().includes(q)
        return linked || (passesStatus && passesSearch)
      }),
    }))
  }, [mapData, filterStatus, search, lotParam])

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
  // overview draws outlines only and the plot would be invisible until you
  // clicked through to it. Derived rather than synced in an effect so a deep
  // link lands on the right section on the very first render. The section is
  // looked up by id in the current (filtered) list, so the filter applies to
  // an open section instead of leaving a stale copy of its lots behind.
  const activeSection = useMemo(() => {
    const id = selectedLot ? selectedLot.section_id : viewSectionId
    if (id === undefined || id === null) return null
    return sections.find((s) => String(s.section_id) === String(id)) || null
  }, [sections, selectedLot, viewSectionId])

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
      ? [
          { to: '/visitor/reservations', label: 'My reservations' },
          { to: '/visitor/payments', label: 'My payments' },
        ]
      : [
          { to: `/${user.role}/reservations`, label: 'Reservations' },
          { to: `/${user.role}/burial-records`, label: 'Burial records' },
        ]
    : []

  const lotQuery = selectedLot ? `?q=${encodeURIComponent(selectedLot.lot_code)}` : ''

  return (
    <div className="map-page">
      <h2>Cemetery Map</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {!mapData && !error && <Loading message="Loading map..." />}

      {mapData && (
        <div className="map-panes">
          <aside className="map-rail">
            <div className="map-rail-group">
              <p className="panel-heading">Sections</p>
              <div className="map-tabs">
                <button
                  type="button"
                  className={!activeSection ? 'map-tab map-tab--active' : 'map-tab'}
                  onClick={showAll}
                >
                  Overview
                </button>
                {sections.map((s) => (
                  <button
                    key={s.section_id}
                    type="button"
                    className={activeSection?.section_id === s.section_id ? 'map-tab map-tab--active' : 'map-tab'}
                    onClick={() => focusSection(s)}
                  >
                    {s.section_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-rail-group">
              <p className="panel-heading">Filter</p>
              <input
                className="search-input map-search"
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
                  >
                    {status === 'all' ? 'All Lots' : STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-rail-group">
              <p className="panel-heading">Display</p>
              <label className="map-toggle">
                <input
                  type="checkbox"
                  checked={showLayout}
                  onChange={(e) => setShowLayout(e.target.checked)}
                />
                Layout reference
              </label>
            </div>

            <div className="map-rail-group map-rail-legend">
              <p className="panel-heading">Legend</p>
              <div className="map-legend">
                <span><i className="dot" style={{ background: STATUS_COLORS.available }} /> Available ({compositeCounts.available})</span>
                <span><i className="dot" style={{ background: STATUS_COLORS.reserved }} /> Reserved ({compositeCounts.reserved})</span>
                <span><i className="dot" style={{ background: STATUS_COLORS.occupied }} /> Occupied ({compositeCounts.occupied})</span>
                {search && <span className="text-muted">{compositeLots.length} matching</span>}
              </div>
            </div>
          </aside>

          <div className="map-layout">
            <CemeterySvgMap
              sections={sections}
              activeSection={activeSection}
              selectedLotId={selectedLot?.lot_id}
              showLayout={showLayout}
              onSelectLot={selectLot}
              onFocusSection={focusSection}
            />

            <aside className="map-detail">
              {selectedLot ? (
                <>
                  <h3>{selectedLot.lot_code}</h3>
                  <dl className="figure-list">
                    <div><dt>Section</dt><dd>{selectedLot.section_name}</dd></div>
                    <div><dt>Block</dt><dd>{selectedLot.block || '—'}</dd></div>
                    <div><dt>Type</dt><dd>{selectedLot.lot_type}</dd></div>
                    <div><dt>Price</dt><dd>₱{Number(selectedLot.price).toLocaleString()}</dd></div>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span className={`badge badge--${selectedLot.status}`}>
                          {STATUS_LABELS[selectedLot.status] || selectedLot.status}
                        </span>
                      </dd>
                    </div>
                  </dl>
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
