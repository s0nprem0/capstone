import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/csv'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import OccupancyBar from '../components/OccupancyBar'
import { PAYMENT_METHODS, label, localISO, longDate, longDateTime, money } from '../lib/terms'

// Each preset is a [from, to] pair; '' leaves that end open.
const PRESETS = {
  month: { label: 'This month', range: (d) => [localISO(new Date(d.getFullYear(), d.getMonth(), 1)), localISO(d)] },
  last: {
    label: 'Last month',
    range: (d) => [
      localISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      localISO(new Date(d.getFullYear(), d.getMonth(), 0)),
    ],
  },
  year: { label: 'This year', range: (d) => [localISO(new Date(d.getFullYear(), 0, 1)), localISO(d)] },
  all: { label: 'All time', range: () => ['', ''] },
}

const periodText = (from, to) => {
  if (!from && !to) return 'All time'
  if (!from) return `Up to ${longDate(to)}`
  if (!to) return `From ${longDate(from)}`
  return from === to ? longDate(from) : `${longDate(from)} – ${longDate(to)}`
}

const AUDIT_COLUMNS = [
  { label: 'When', value: (l) => l.created_at },
  { label: 'User', value: (l) => l.user_name || 'System' },
  { label: 'Action', value: (l) => l.action },
  { label: 'Table', value: (l) => l.table_name },
  { label: 'Record', value: (l) => l.record_id },
]

/**
 * What happened in a period, on one printable page. The full lists live on
 * their own pages, each with Print and Export that keep its filters; this page
 * used to repeat them, minus the filters.
 */
export default function Reports() {
  const { user } = useAuth()
  const [preset, setPreset] = useState('year')
  const [[from, to], setRange] = useState(() => PRESETS.year.range(new Date()))
  const [summary, setSummary] = useState(null)
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')

  const qs = new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v)).toString()

  useEffect(() => {
    let current = true
    setError('')
    Promise.all([
      api(`/api/reports/summary${qs ? `?${qs}` : ''}`),
      api(`/api/reports/audit-logs${qs ? `?${qs}` : ''}`),
    ]).then(([s, a]) => {
      if (!current) return
      if (s.ok) setSummary(s.data)
      else setError(s.data?.error || 'Failed to load the summary')
      if (a.ok) setAudit(a.data)
    })
    return () => { current = false }
  }, [qs])

  const choosePreset = (key) => {
    setPreset(key)
    setRange(PRESETS[key].range(new Date()))
  }

  const setEnd = (index) => (e) => {
    setPreset('')
    setRange((prev) => (index === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]))
  }

  const base = `/${user.role}`
  const period = periodText(from, to)

  return (
    <div className="report-page">
      <PageHeader title="Reports">
        <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()} disabled={!summary}>
          Print
        </button>
      </PageHeader>

      <div className="report-period no-print" role="group" aria-label="Report period">
        <div className="status-tabs">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              className={preset === key ? 'chip chip--active' : 'chip'}
              aria-pressed={preset === key}
              onClick={() => choosePreset(key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>
          From
          <input type="date" value={from} max={to || undefined} onChange={setEnd(0)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from || undefined} onChange={setEnd(1)} />
        </label>
      </div>

      <p className="report-period-line">
        <strong>{period}</strong> <span className="text-muted">· printed {longDate(localISO())}</span>
      </p>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!summary && !error && <Loading message="Building the report..." />}

      {summary && (
        <div className="dash">
          <section className="dash-panel" aria-labelledby="r-res">
            <h3 id="r-res">Reservations received <Link className="report-link no-print" to={`${base}/reservations`}>Full list</Link></h3>
            <div className="stat-row">
              <Tile label="Received" value={summary.reservations.total} />
              <Tile label="Pending" value={summary.reservations.pending} />
              <Tile label="Approved" value={summary.reservations.approved} />
              <Tile label="Rejected" value={summary.reservations.rejected} />
              <Tile label="Value booked" value={money(summary.reservations.value)} />
            </div>
          </section>

          <div className="dash-pair">
            <section className="dash-panel" aria-labelledby="r-pay">
              <h3 id="r-pay">Payments collected <Link className="report-link no-print" to={`${base}/payments`}>Full list</Link></h3>
              <div className="stat-row">
                <Tile label="Collected" value={money(summary.payments.total)} />
                <Tile label="Payments" value={summary.payments.count} />
              </div>
              {summary.payments.by_method.length > 0 && (
                <table className="table report-table">
                  <caption className="visually-hidden">Payments by method</caption>
                  <thead>
                    <tr><th>Method</th><th className="num">Payments</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {summary.payments.by_method.map((m) => (
                      <tr key={m.method}>
                        <td>{label(PAYMENT_METHODS, m.method)}</td>
                        <td className="num">{m.count}</td>
                        <td className="num">{money(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="dash-panel" aria-labelledby="r-bur">
              <h3 id="r-bur">Interments <Link className="report-link no-print" to={`${base}/burial-records`}>Register</Link></h3>
              <div className="stat-row">
                <Tile label="In period" value={summary.burials.total} />
                <Tile label="Scheduled" value={summary.burials.scheduled} />
                <Tile label="Interred" value={summary.burials.interred} />
              </div>
            </section>
          </div>

          <section className="dash-panel" aria-labelledby="r-lots">
            <h3 id="r-lots">Plot availability <span className="text-muted">· as of today</span></h3>
            <div className="stat-row">
              <Tile label="Plots" value={summary.lots.total.toLocaleString()} />
              <Tile label="Available" value={summary.lots.available.toLocaleString()} />
              <Tile label="Reserved" value={summary.lots.reserved} />
              <Tile label="Occupied" value={summary.lots.occupied} />
            </div>
            <div className="table-container report-scroll">
              <table className="table report-table">
                <caption className="visually-hidden">Plot availability by section</caption>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th className="num">Plots</th>
                    <th className="num">Available</th>
                    <th className="num">Reserved</th>
                    <th className="num">Occupied</th>
                    <th><span className="visually-hidden">Share</span></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lots.sections.map((s) => (
                    <tr key={s.section_id}>
                      <td>{s.section_name}</td>
                      <td className="num">{s.total}</td>
                      <td className="num">{s.available}</td>
                      <td className="num">{s.reserved || '—'}</td>
                      <td className="num">{s.occupied || '—'}</td>
                      <td className="report-bar"><OccupancyBar counts={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {audit && (
            <section className="dash-panel" aria-labelledby="r-audit">
              <div className="report-section-head">
                <h3 id="r-audit">
                  Audit log{' '}
                  <span className="text-muted">
                    · {audit.total > audit.items.length ? `latest ${audit.items.length} of ${audit.total}` : `${audit.total} ${audit.total === 1 ? 'entry' : 'entries'}`}
                  </span>
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm no-print"
                  disabled={!audit.items.length}
                  onClick={() => downloadCsv(`audit-log-${from || 'start'}-to-${to || localISO()}`, AUDIT_COLUMNS, audit.items)}
                >
                  Export CSV
                </button>
              </div>
              {audit.items.length === 0 ? (
                <p className="text-muted">No activity in this period.</p>
              ) : (
                <div className="table-container report-scroll">
                  <table className="table report-table">
                    <caption className="visually-hidden">Audit log</caption>
                    <thead>
                      <tr><th>When</th><th>User</th><th>Action</th><th>Table</th><th>Record</th></tr>
                    </thead>
                    <tbody>
                      {audit.items.map((l) => (
                        <tr key={l.log_id}>
                          <td>{longDateTime(l.created_at)}</td>
                          <td>{l.user_name || 'System'}</td>
                          <td>{l.action}</td>
                          <td>{l.table_name}</td>
                          <td>{l.record_id ? `#${l.record_id}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Tile({ label: text, value }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{text}</p>
      <p className="stat-value">{value}</p>
    </div>
  )
}
