import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import OccupancyMap from '../components/OccupancyMap'
import { STATUS_COLORS } from '../components/CemeterySvgMap'
import Loading from '../components/Loading'

const STATUSES = ['available', 'reserved', 'occupied']

const STATUS_LABELS = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/stats/dashboard').then(({ ok, data }) => {
      if (ok) setStats(data)
      else setError(data?.error || 'Failed to load stats')
    })
  }, [])

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (ok) setMapData(data)
      else setError((current) => current || data?.error || 'Failed to load map data')
    })
  }, [])

  const queue = stats
    ? [
        {
          to: `/${user.role}/reservations`,
          label: 'Reservations awaiting approval',
          count: stats.reservations.pending,
        },
        {
          to: `/${user.role}/payments`,
          label: 'Payments to validate',
          count: stats.payments.pending,
        },
        {
          to: `/${user.role}/burial-records`,
          label: 'Interments scheduled',
          count: stats.burials.pending,
        },
      ].filter((item) => item.count > 0)
    : []

  const loading = !stats && !mapData && !error

  return (
    <div>
      <h2>Dashboard</h2>
      <p className="text-muted">Welcome, {user.fullname} ({user.role}).</p>

      {error && <p className="alert alert--error">{error}</p>}

      {loading && <Loading message="Loading dashboard..." />}

      {(stats || mapData) && (
        <div className="dash-grid">
          <section className="dash-panel">
            <div className="dash-panel-head">
              <h3>Occupancy</h3>
              <Link to="/">Open the full map</Link>
            </div>

            {mapData ? (
              <OccupancyMap sections={mapData.sections} />
            ) : (
              <p className="text-muted">Map unavailable.</p>
            )}

            {stats && (
              <>
                <div className="occupancy-meter" aria-hidden="true">
                  {STATUSES.filter((s) => stats.lots[s] > 0).map((s) => (
                    <span key={s} style={{ flexGrow: stats.lots[s], background: STATUS_COLORS[s] }} />
                  ))}
                </div>
                <div className="dash-legend">
                  {STATUSES.map((s) => (
                    <span key={s}>
                      <i className="dot" style={{ background: STATUS_COLORS[s] }} /> {STATUS_LABELS[s]} ({stats.lots[s]})
                    </span>
                  ))}
                  <span className="text-muted">{stats.lots.total} plots</span>
                </div>
              </>
            )}
          </section>

          <div className="dash-stack">
            <section className="dash-panel">
              <h3>Key figures</h3>
              {stats ? (
                <dl className="figure-list">
                  <div><dt>Plots</dt><dd>{stats.lots.total}</dd></div>
                  <div><dt>Reservations</dt><dd>{stats.reservations.total}</dd></div>
                  <div><dt>Revenue collected</dt><dd>₱{Number(stats.payments.total_revenue).toLocaleString()}</dd></div>
                  <div><dt>Burial records</dt><dd>{stats.burials.total}</dd></div>
                  <div><dt>Users</dt><dd>{stats.users}</dd></div>
                </dl>
              ) : (
                <p className="text-muted">Unavailable.</p>
              )}
            </section>

            <section className="dash-panel">
              <h3>Pending work</h3>
              {!stats ? (
                <p className="text-muted">Unavailable.</p>
              ) : queue.length === 0 ? (
                <p className="text-muted">Nothing waiting.</p>
              ) : (
                <ul className="queue">
                  {queue.map((item) => (
                    <li key={item.to}>
                      <Link to={item.to}>
                        <span>{item.label}</span>
                        <span className="queue-count">{item.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
