import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [myReservations, setMyReservations] = useState([])

  useEffect(() => {
    if (!user || user.role === 'user') return
    const load = async () => {
      const { ok, data } = await api('/api/stats/dashboard')
      if (ok) setStats(data)
      else setError(data?.error || 'Failed to load stats')
    }
    load()
  }, [user])

  useEffect(() => {
    if (!user || user.role !== 'user') return
    api('/api/reservations/mine').then(({ ok, data }) => {
      if (ok) setMyReservations(data)
      else setError(data?.error || 'Failed to load your reservations')
    })
  }, [user])

  if (!user) {
    return (
      <div>
        <h2>Welcome to St. John Memorial Garden &amp; Parks</h2>
        <p className="text-muted">
          Browse the cemetery map to view available plots, or sign in to make a reservation.
        </p>
        <div className="dashboard-actions">
          <Link to="/cemetery" className="btn btn-primary">View Cemetery Map</Link>
          <Link to="/login" className="btn btn-secondary">Sign In</Link>
        </div>
      </div>
    )
  }

  if (user.role === 'user') {
    const total = myReservations.length
    const pending = myReservations.filter((r) => r.approved_status === 'pending').length
    const approved = myReservations.filter((r) => r.approved_status === 'approved').length
    const paid = myReservations.filter((r) => r.payment_status === 'paid').length

    return (
      <div>
        <h2>Dashboard</h2>
        <p className="text-muted">Welcome back, {user.fullname}. Manage your reservations below.</p>

        {error && <p className="alert alert--error">{error}</p>}

        <div className="dashboard-actions">
          <Link to="/reservations/new" className="btn btn-primary">Reserve a Plot</Link>
          <Link to="/cemetery" className="btn btn-secondary">View Cemetery Map</Link>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>My Reservations</h3>
            <p className="stat-number">{total}</p>
          </div>
          <div className="stat-card">
            <h3>Pending Approval</h3>
            <p className="stat-number">{pending}</p>
          </div>
          <div className="stat-card">
            <h3>Approved</h3>
            <p className="stat-number">{approved}</p>
          </div>
          <div className="stat-card">
            <h3>Paid</h3>
            <p className="stat-number">{paid}</p>
          </div>
        </div>

        <div className="section-block table-container">
          <h3 className="section-title">Recent Reservations</h3>
          {myReservations.length === 0 ? (
            <p className="text-muted">You don't have any reservations yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Lot</th>
                  <th>Section</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {myReservations.map((r) => (
                  <tr key={r.reservation_id}>
                    <td>{r.reservation_id}</td>
                    <td>{r.lot_code}</td>
                    <td>{r.section_name}</td>
                    <td>{r.reservation_date}</td>
                    <td>₱{Number(r.total_amount).toLocaleString()}</td>
                    <td><span className={`badge badge--${r.payment_status}`}>{r.payment_status}</span></td>
                    <td><span className={`badge badge--${r.approved_status}`}>{r.approved_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Dashboard</h2>
      <p className="text-muted">Welcome, {user.fullname} ({user.role}).</p>

      {error && <p className="alert alert--error">{error}</p>}

      {stats ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Lots</h3>
              <p className="stat-number">{stats.lots.total}</p>
            </div>
            <div className="stat-card">
              <h3>Available</h3>
              <p className="stat-number">{stats.lots.available}</p>
            </div>
            <div className="stat-card">
              <h3>Reserved</h3>
              <p className="stat-number">{stats.lots.reserved}</p>
            </div>
            <div className="stat-card">
              <h3>Occupied</h3>
              <p className="stat-number">{stats.lots.occupied}</p>
            </div>
          </div>

          <div className="stats-grid section-block">
            <div className="stat-card">
              <h3>Reservations</h3>
              <p className="stat-number">{stats.reservations.total}</p>
            </div>
            <div className="stat-card">
              <h3>Pending Approval</h3>
              <p className="stat-number">{stats.reservations.pending}</p>
            </div>
            <div className="stat-card">
              <h3>Total Revenue</h3>
              <p className="stat-number">₱{Number(stats.payments.total_revenue).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h3>Burial Records</h3>
              <p className="stat-number">{stats.burials.total}</p>
            </div>
          </div>

          {stats.recent_reservations.length > 0 && (
            <div className="section-block table-container">
              <h3 className="section-title">Recent Reservations</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Lot</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_reservations.map((r) => (
                    <tr key={r.reservation_id}>
                      <td>{r.reservation_id}</td>
                      <td>{r.lot_code}</td>
                      <td>{r.fullname}</td>
                      <td>{r.reservation_date}</td>
                      <td><span className={`badge badge--${r.approved_status}`}>{r.approved_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : !error ? (
        <p className="text-muted">Loading stats...</p>
      ) : null}
    </div>
  )
}