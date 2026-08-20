export default function Reservations() {
  return (
    <div>
      <div className="page-header">
        <h2>Reservations</h2>
        <a href="/reservations/new" className="btn btn-primary">New Reservation</a>
      </div>
      <div className="table-container">
        <p className="text-muted">No reservations yet.</p>
      </div>
    </div>
  )
}
