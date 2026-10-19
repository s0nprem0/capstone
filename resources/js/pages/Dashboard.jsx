import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import OccupancyBar from '../components/OccupancyBar'
import { LOT_STATUS, PLOT_STATUSES, money } from '../lib/terms'

const share = (count, total) => {
  if (!total || !count) return '0%'
  const pct = (count / total) * 100
  if (pct < 1) return '<1%'
  // 6,728 of 6,748 is not all of them.
  if (pct > 99 && count < total) return '>99%'
  return `${Math.round(pct)}%`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/stats/dashboard').then(({ ok, data }) => {
      if (ok) setStats(data)
      else setError(data?.error || 'Failed to load stats')
    })
  }, [])

  // What is waiting on someone, first: the rest of the page is for reading,
  // this is the part that gets acted on.
  const queue = stats
    ? [
        {
          to: `/${user.role}/reservations`,
          label: 'Reservations awaiting approval',
          count: stats.reservations.pending,
        },
        {
          to: `/${user.role}/burial-records`,
          label: 'Interments scheduled',
          count: stats.burials.pending,
        },
      ].filter((item) => item.count > 0)
    : []

  return (
    <div>
      <PageHeader title="Dashboard">
        <Link to="/" className="btn btn-secondary">Open the cemetery map</Link>
      </PageHeader>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!stats && !error && <Loading message="Loading dashboard..." />}

      {stats && (
        <div className="dash">
          <section className={`dash-panel${queue.length ? ' dash-queue--waiting' : ''}`} aria-labelledby="queue-heading">
            <h3 id="queue-heading">Needs attention</h3>
            {queue.length === 0 ? (
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

          {/* The tiles double as the bar's legend: each carries its status
              swatch, so the counts are printed once. */}
          <section className="dash-panel" aria-labelledby="plots-heading">
            <h3 id="plots-heading">Plots <span className="text-muted">· {stats.lots.total.toLocaleString()} in all</span></h3>
            <div className="stat-row">
              {PLOT_STATUSES.map((s) => (
                <div className="stat-tile" key={s}>
                  <p className="stat-label">
                    <i className={`swatch-dot swatch-dot--${s}`} aria-hidden="true" /> {LOT_STATUS[s]}
                  </p>
                  <p className="stat-value">{stats.lots[s].toLocaleString()}</p>
                  <p className="stat-sub">{share(stats.lots[s], stats.lots.total)} of plots</p>
                </div>
              ))}
            </div>
            <OccupancyBar counts={stats.lots} large />
          </section>

          <div className="dash-pair">
            <section className="dash-panel" aria-labelledby="money-heading">
              <h3 id="money-heading">Payments</h3>
              <div className="stat-row">
                <div className="stat-tile">
                  <p className="stat-label">Collected this month</p>
                  <p className="stat-value">{money(stats.payments?.this_month)}</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-label">Collected in all</p>
                  <p className="stat-value">{money(stats.payments?.total)}</p>
                </div>
              </div>
            </section>

            <section className="dash-panel" aria-labelledby="records-heading">
              <h3 id="records-heading">Records</h3>
              <dl className="figure-list">
                <div>
                  <dt><Link to={`/${user.role}/reservations`}>Reservations</Link></dt>
                  <dd>{stats.reservations.total} <span className="text-muted">({stats.reservations.approved} approved)</span></dd>
                </div>
                <div>
                  <dt><Link to={`/${user.role}/burial-records`}>Burial records</Link></dt>
                  <dd>{stats.burials.total}</dd>
                </div>
                <div>
                  <dt><Link to={`/${user.role}/users`}>User accounts</Link></dt>
                  <dd>{stats.users}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
