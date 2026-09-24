import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [activeSection, setActiveSection] = useState(null)
  const [selectedLot, setSelectedLot] = useState(null)
  const [showLayout, setShowLayout] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (ok) setMapData(data)
      else setError(data?.error || 'Failed to load map data')
    })
  }, [])

  const sections = useMemo(() => {
    if (!mapData) return []
    const q = search.trim().toLowerCase()
    return mapData.sections.map((s) => ({
      ...s,
      lots: (s.lots || []).filter(
        (l) =>
          (filterStatus === 'all' || l.status === filterStatus) &&
          (!q || l.lot_code.toLowerCase().includes(q))
      ),
    }))
  }, [mapData, filterStatus, search])

  const compositeLots = useMemo(() => (sections || []).flatMap((s) => s.lots || []), [sections])
  const compositeCounts = useMemo(() => {
    const counts = { available: 0, reserved: 0, occupied: 0 }
    compositeLots.forEach((l) => {
      if (counts[l.status] !== undefined) counts[l.status]++
    })
    return counts
  }, [compositeLots])

  const focusSection = (section) => {
    setActiveSection(section)
    setSelectedLot(null)
  }

  const showAll = () => {
    setActiveSection(null)
    setSelectedLot(null)
  }

  return (
    <div>
      <h2>Cemetery Map</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {!mapData && !error && <Loading message="Loading map..." />}

      {mapData && (
        <>
          <div className="map-toolbar">
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

            <div className="map-toolbar-row">
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

              <input
                className="search-input map-search"
                placeholder="Search lot code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <label className="map-toggle">
                <input
                  type="checkbox"
                  checked={showLayout}
                  onChange={(e) => setShowLayout(e.target.checked)}
                />
                Layout reference
              </label>
            </div>
          </div>

          <div className="map-legend">
            <span><i className="dot" style={{ background: STATUS_COLORS.available }} /> Available ({compositeCounts.available})</span>
            <span><i className="dot" style={{ background: STATUS_COLORS.reserved }} /> Reserved ({compositeCounts.reserved})</span>
            <span><i className="dot" style={{ background: STATUS_COLORS.occupied }} /> Occupied ({compositeCounts.occupied})</span>
            {search && <span className="text-muted">{compositeLots.length} matching</span>}
          </div>

          <div className="map-layout">
            <CemeterySvgMap
              sections={sections}
              activeSection={activeSection}
              selectedLotId={selectedLot?.lot_id}
              showLayout={showLayout}
              onSelectLot={setSelectedLot}
              onFocusSection={focusSection}
            />

            {selectedLot && (
              <aside className="map-detail">
                <h3>{selectedLot.lot_code}</h3>
                <dl className="map-detail-list">
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
                    <Link to="/login" className="btn btn-primary btn-block">
                      Sign in to reserve
                    </Link>
                  ))}
                {selectedLot.status !== 'available' && (
                  <p className="text-muted map-hint">This plot is currently {STATUS_LABELS[selectedLot.status].toLowerCase()}.</p>
                )}
              </aside>
            )}
          </div>

          {!user && !selectedLot && (
            <p className="text-muted map-hint">
              <Link to="/login">Sign in</Link> to reserve an available plot.
            </p>
          )}
        </>
      )}
    </div>
  )
}