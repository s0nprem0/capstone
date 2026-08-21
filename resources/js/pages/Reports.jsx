import { useState } from 'react'
import { api } from '../lib/api'

export default function Reports() {
  const [report, setReport] = useState(null)
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async (reportType) => {
    setType(reportType)
    setLoading(true)
    setError('')
    setReport(null)
    const { ok, data } = await api(`/api/reports/${reportType}`)
    setLoading(false)
    if (ok) setReport(data)
    else setError(data?.error || 'Failed to generate report')
  }

  const handlePrint = () => {
    window.print()
  }

  const formatCurrency = (val) => `₱${Number(val).toLocaleString()}`

  return (
    <div>
      <div className="page-header no-print">
        <h2>Reports</h2>
        {report && (
          <button className="btn btn-primary" onClick={handlePrint}>Print Report</button>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {!report && (
        <div className="reports-grid">
          <button className="report-card" onClick={() => generate('reservations')} disabled={loading}>
            <h3>Reservations Report</h3>
            <p>Total, pending, approved, and rejected reservations</p>
          </button>
          <button className="report-card" onClick={() => generate('payments')} disabled={loading}>
            <h3>Payments Report</h3>
            <p>Payment totals, pending, and revenue summary</p>
          </button>
          <button className="report-card" onClick={() => generate('burial-records')} disabled={loading}>
            <h3>Burial Records Report</h3>
            <p>All burial records with status breakdown</p>
          </button>
          <button className="report-card" onClick={() => generate('availability')} disabled={loading}>
            <h3>Lot Availability Report</h3>
            <p>Lots by section with availability status</p>
          </button>
          <button className="report-card" onClick={() => generate('audit-logs')} disabled={loading}>
            <h3>Audit Log Report</h3>
            <p>Recent system activity and changes</p>
          </button>
        </div>
      )}

      {loading && <p className="text-muted">Generating report...</p>}

      {report && type === 'reservations' && (
        <div className="report-output">
          <h3>Reservations Report</h3>
          <p className="text-muted">Generated: {new Date().toLocaleString()}</p>
          <div className="report-stats">
            <span>Total: {report.total}</span>
            <span>Pending: {report.pending}</span>
            <span>Approved: {report.approved}</span>
            <span>Rejected: {report.rejected}</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Lot</th><th>Client</th><th>Date</th><th>Amount</th><th>Approval</th><th>Payment</th></tr>
              </thead>
              <tbody>
                {report.items.map((r) => (
                  <tr key={r.reservation_id}>
                    <td>{r.reservation_id}</td>
                    <td>{r.lot_code}</td>
                    <td>{r.user_name}</td>
                    <td>{r.reservation_date}</td>
                    <td>{formatCurrency(r.total_amount)}</td>
                    <td><span className={`badge badge--${r.approved_status}`}>{r.approved_status}</span></td>
                    <td><span className={`badge badge--${r.payment_status}`}>{r.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary no-print" style={{ marginTop: '1rem' }} onClick={() => setReport(null)}>Back</button>
        </div>
      )}

      {report && type === 'payments' && (
        <div className="report-output">
          <h3>Payments Report</h3>
          <p className="text-muted">Generated: {new Date().toLocaleString()}</p>
          <div className="report-stats">
            <span>Total: {report.total}</span>
            <span>Pending: {report.pending}</span>
            <span>Total Revenue: {formatCurrency(report.total_revenue)}</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Lot</th><th>Client</th><th>Amount</th><th>Method</th><th>Status</th></tr>
              </thead>
              <tbody>
                {report.items.map((p) => (
                  <tr key={p.payment_id}>
                    <td>{p.payment_id}</td>
                    <td>{p.lot_code}</td>
                    <td>{p.user_name}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{p.payment_method}</td>
                    <td><span className={`badge badge--${p.payment_status}`}>{p.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary no-print" style={{ marginTop: '1rem' }} onClick={() => setReport(null)}>Back</button>
        </div>
      )}

      {report && type === 'burial-records' && (
        <div className="report-output">
          <h3>Burial Records Report</h3>
          <p className="text-muted">Generated: {new Date().toLocaleString()}</p>
          <div className="report-stats">
            <span>Total: {report.total}</span>
            <span>Scheduled: {report.scheduled}</span>
            <span>Interred: {report.interred}</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Deceased</th><th>Lot</th><th>Section</th><th>Burial Date</th><th>Type</th><th>Status</th></tr>
              </thead>
              <tbody>
                {report.items.map((b) => (
                  <tr key={b.burial_id}>
                    <td>{b.burial_id}</td>
                    <td>{b.deceased_fullname}</td>
                    <td>{b.lot_code}</td>
                    <td>{b.section_name}</td>
                    <td>{b.burial_date}</td>
                    <td>{b.burial_type}</td>
                    <td><span className={`badge badge--${b.interment_status === 'interred' ? 'paid' : 'pending'}`}>{b.interment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary no-print" style={{ marginTop: '1rem' }} onClick={() => setReport(null)}>Back</button>
        </div>
      )}

      {report && type === 'availability' && (
        <div className="report-output">
          <h3>Lot Availability Report</h3>
          <p className="text-muted">Generated: {new Date().toLocaleString()}</p>
          <div className="report-stats">
            <span>Total: {report.total}</span>
            <span>Available: {report.available}</span>
            <span>Reserved: {report.reserved}</span>
            <span>Occupied: {report.occupied}</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Lot Code</th><th>Section</th><th>Type</th><th>Block</th><th>Price</th><th>Status</th></tr>
              </thead>
              <tbody>
                {report.items.map((l) => (
                  <tr key={l.lot_id}>
                    <td>{l.lot_code}</td>
                    <td>{l.section_name}</td>
                    <td>{l.lot_type}</td>
                    <td>{l.block || '—'}</td>
                    <td>{formatCurrency(l.price)}</td>
                    <td><span className={`badge badge--${l.status === 'available' ? 'paid' : l.status === 'reserved' ? 'pending' : 'failed'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary no-print" style={{ marginTop: '1rem' }} onClick={() => setReport(null)}>Back</button>
        </div>
      )}

      {report && type === 'audit-logs' && (
        <div className="report-output">
          <h3>Audit Log Report</h3>
          <p className="text-muted">Generated: {new Date().toLocaleString()}</p>
          <div className="report-stats">
            <span>Total entries: {report.total}</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>Date</th></tr>
              </thead>
              <tbody>
                {report.items.map((l) => (
                  <tr key={l.log_id}>
                    <td>{l.log_id}</td>
                    <td>{l.user_name || 'System'}</td>
                    <td>{l.action}</td>
                    <td>{l.table_name}</td>
                    <td>#{l.record_id || '—'}</td>
                    <td>{l.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary no-print" style={{ marginTop: '1rem' }} onClick={() => setReport(null)}>Back</button>
        </div>
      )}
    </div>
  )
}
