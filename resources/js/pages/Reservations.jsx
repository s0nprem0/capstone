import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'

export default function Reservations() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState('')
  const [approval, setApproval] = useState('')
  const [busy, setBusy] = useState(null)
  const q = useDebounced(search)

  const load = async () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (payment) params.set('payment_status', payment)
    if (approval) params.set('approved_status', approval)
    const qs = params.toString()
    const base = user?.role === 'user' ? '/api/reservations/mine' : '/api/reservations'
    const path = qs ? `${base}?${qs}` : base
    const { ok, data } = await api(path)
    if (ok) setReservations(data)
    else setError(data?.error || 'Failed to load reservations')
  }

  useEffect(() => {
    load()
  }, [q, payment, approval, user])

  const decide = async (id, action) => {
    setBusy(`${id}:${action}`)
    const { ok, data } = await api(`/api/reservations/${id}/${action}`, { method: 'POST' })
    setBusy(null)
    if (ok) load()
    else setError(data?.error || 'Action failed')
  }

  const isStaffView = user && user.role !== 'user'

  return (
    <div>
      <div className="page-header">
        <h2>{isStaffView ? 'All Reservations' : 'My Reservations'}</h2>
        {user?.role === 'user' && (
          <Link to="/visitor/reserve" className="btn btn-primary">New Reservation</Link>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by lot, name, section, date, status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">All payments</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
        <select value={approval} onChange={(e) => setApproval(e.target.value)}>
          <option value="">All approvals</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="table-container section-block">
        {reservations.length === 0 ? (
          <p className="text-muted">No reservations found.</p>
        ) : (
          <table className="table">
            <caption className="visually-hidden">Reservations</caption>
            <thead>
              <tr>
                <th>ID</th>
                <th>Lot</th>
                <th>Section</th>
                {isStaffView && <th>Client</th>}
                <th>Date</th>
                <th>Slots</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Approval</th>
                {isStaffView && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.reservation_id}>
                  <td>{r.reservation_id}</td>
                  <td>{r.lot_code}</td>
                  <td>{r.section_name}</td>
                  {isStaffView && <td>{r.user_name}</td>}
                  <td>{r.reservation_date}</td>
                  <td>{r.number_of_slots}</td>
                  <td>₱{Number(r.total_amount).toLocaleString()}</td>
                  <td><span className={`badge badge--${r.payment_status}`}>{r.payment_status}</span></td>
                  <td><span className={`badge badge--${r.approved_status}`}>{r.approved_status}</span></td>
                  {isStaffView && (
                    <td>
                      {r.approved_status === 'pending' ? (
                        <div className="table-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!!busy}
                            onClick={() => decide(r.reservation_id, 'approve')}
                          >
                            {busy === `${r.reservation_id}:approve` ? 'Working...' : 'Approve'}
                          </button>
                          <ConfirmButton
                            label="Reject"
                            danger
                            onConfirm={() => decide(r.reservation_id, 'reject')}
                            busy={busy === `${r.reservation_id}:reject`}
                            message="Reject this reservation? The lot will be released."
                          />
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}