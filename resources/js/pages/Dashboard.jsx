import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const { ok, data } = await api('/api/stats/dashboard')
      if (ok) setStats(data)
      else setError(data?.error || 'Failed to load stats')
    }
    load()
  }, [])

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