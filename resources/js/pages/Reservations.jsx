import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'

export default function Reservations() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)

  const load = async () => {
    const path = user?.role === 'user' ? '/api/reservations/mine' : '/api/reservations'
    const { ok, data } = await api(path)
    if (ok) setReservations(data)
    else setError(data?.error || 'Failed to load reservations')
  }

  useEffect(() => {
    load()
  }, [user])

  const filtered = reservations.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.lot_code && r.lot_code.toLowerCase().includes(q)) ||
      (r.user_name && r.user_name.toLowerCase().includes(q)) ||
      (r.section_name && r.section_name.toLowerCase().includes(q)) ||
      (r.reservation_date && r.reservation_date.includes(q)) ||
      (r.approved_status && r.approved_status.toLowerCase().includes(q)) ||
      (r.purpose && r.purpose.toLowerCase().includes(q))
    )
  })

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
          <Link to="/reservations/new" className="btn btn-primary">New Reservation</Link>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <input
        type="text"
        className="search-input"
        placeholder="Search by lot, name, section, date, status..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="table-container section-block">
        {filtered.length === 0 ? (
          <p className="text-muted">No reservations found.</p>
        ) : (
          <table className="table">
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
              {filtered.map((r) => (
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
                  {isStaffView && r.approved_status === 'pending' && (
                    <td>
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