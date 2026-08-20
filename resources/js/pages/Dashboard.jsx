export default function Dashboard() {
  return (
    <div>
      <h2>Dashboard</h2>
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
