import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import useList from '../lib/useList'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Notice, { useNotice } from '../components/Notice'
import StatusBadge from '../components/StatusBadge'
import { APPROVAL_STATUS, longDate, money } from '../lib/terms'

export default function Reservations() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  // Deep links from the map arrive as ?q=<lot code>. The existing search
  // already matches lot codes, so there is no second filter to maintain.
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [approval, setApproval] = useState('')
  const [busy, setBusy] = useState(null)
  const { notice, succeed, fail, clear } = useNotice()
  const q = useDebounced(search)

  const isStaffView = user && user.role !== 'user'
  const base = isStaffView ? '/api/reservations' : '/api/reservations/mine'
  // The approval tabs filter here rather than on the server, so each tab can
  // show its count -- "Pending (3)" is the queue staff open this page for.
  const { items: reservations, loaded, error, reload } = useList(base, { q }, 'Failed to load reservations')

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 }
    reservations.forEach((r) => {
      if (c[r.approved_status] !== undefined) c[r.approved_status]++
    })
    return c
  }, [reservations])

  const shown = approval ? reservations.filter((r) => r.approved_status === approval) : reservations
  const showActions = isStaffView && shown.some((r) => r.approved_status === 'pending')

  const decide = async (r, action) => {
    clear()
    setBusy(`${r.reservation_id}:${action}`)
    const { ok, data } = await api(`/api/reservations/${r.reservation_id}/${action}`, { method: 'POST' })
    setBusy(null)
    if (ok) {
      succeed(`Reservation #${r.reservation_id} for ${r.lot_code} ${action === 'approve' ? 'approved' : 'rejected'}.`)
      reload()
    } else {
      fail(data?.error || 'Action failed')
    }
  }

  const tabs = [['', 'All', reservations.length], ...Object.entries(APPROVAL_STATUS).map(([v, l]) => [v, l, counts[v]])]

  return (
    <div>
      <PageHeader title={isStaffView ? 'Reservations' : 'My Reservations'}>
        {!isStaffView && <Link to="/visitor/reserve" className="btn btn-primary">New Reservation</Link>}
      </PageHeader>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      <div className="filter-bar">
        <input
          type="search"
          className="search-input"
          aria-label="Search reservations"
          placeholder={isStaffView ? 'Search by lot, client, section or date…' : 'Search by lot, section or date…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="status-tabs" role="group" aria-label="Filter by approval">
        {tabs.map(([value, text, count]) => (
          <button
            key={value || 'all'}
            type="button"
            className={approval === value ? 'chip chip--active' : 'chip'}
            aria-pressed={approval === value}
            onClick={() => setApproval(value)}
          >
            {text} <span className="chip-count">{count}</span>
          </button>
        ))}
      </div>

      {!loaded && !error && <Loading message="Loading reservations..." />}

      {loaded && !error && (
      <div className="table-container section-block">
        {shown.length === 0 ? (
          <EmptyState
            noun="reservations"
            filtered={Boolean(q || approval)}
            onClear={() => { setSearch(''); setApproval('') }}
          />
        ) : (
          <table className="table">
            <caption className="visually-hidden">Reservations</caption>
            <thead>
              <tr>
                <th>Plot</th>
                {isStaffView && <th>Client</th>}
                <th>Date</th>
                <th className="num">Slots</th>
                <th>Approval</th>
                <th>Payment</th>
                {showActions && <th><span className="visually-hidden">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.reservation_id}>
                  <td>
                    <Link to={`/?lot=${r.lot_id}`} title="Show on the cemetery map">{r.lot_code}</Link>
                    <span className="text-muted"> #{r.reservation_id}</span>
                    <span className="cell-sub">{r.section_name}</span>
                  </td>
                  {isStaffView && <td>{r.user_name}</td>}
                  <td>{longDate(r.reservation_date)}</td>
                  <td className="num">{r.number_of_slots}</td>
                  <td><StatusBadge kind="approval" value={r.approved_status} /></td>
                  <td>
                    <StatusBadge kind="payment" value={r.payment_status} />
                    <span className="cell-sub">
                      {money(r.amount_paid)} of {money(r.total_amount)}
                    </span>
                  </td>
                  {showActions && (
                    <td>
                      {r.approved_status === 'pending' && (
                        <div className="table-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!!busy}
                            onClick={() => decide(r, 'approve')}
                          >
                            {busy === `${r.reservation_id}:approve` ? 'Working...' : 'Approve'}
                          </button>
                          <ConfirmButton
                            label="Reject"
                            danger
                            onConfirm={() => decide(r, 'reject')}
                            busy={busy === `${r.reservation_id}:reject`}
                            message="Reject this reservation? The lot will be released."
                          />
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  )
}
