import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h2>Dashboard</h2>
      {user ? (
        <p className="text-muted">Welcome, {user.fullname} ({user.role}).</p>
      ) : (
        <p className="text-muted">Welcome. Please sign in to reserve a plot.</p>
      )}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Lots</h3>
          <p className="stat-number">—</p>
        </div>
        <div className="stat-card">
          <h3>Reserved</h3>
          <p className="stat-number">—</p>
        </div>
        <div className="stat-card">
          <h3>Available</h3>
          <p className="stat-number">—</p>
        </div>
        <div className="stat-card">
          <h3>Occupied</h3>
          <p className="stat-number">—</p>
        </div>
      </div>
    </div>
  )
}