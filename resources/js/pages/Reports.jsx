import { useState } from 'react'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import { BURIAL_TYPES, LOT_TYPES, PAYMENT_METHODS, label, longDate, longDateTime, money } from '../lib/terms'

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

  return (
    <div>
      <div className="page-header no-print">
        <h2>Reports</h2>
        {report && (
          <button className="btn btn-primary" onClick={handlePrint}>Print Report</button>
        )}
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {!report && (
        <div className="reports-grid">
          <button className="report-card" onClick={() => generate('reservations')} disabled={loading}>
            <h3>Reservations Report</h3>
            <p>Total, pending, approved, and rejected reservations</p>
          </button>
          <button className="report-card" onClick={() => generate('burial-records')} disabled={loading}>
            <h3>Burial Records Report</h3>
            <p>All burial records with status breakdown</p>
          </button>
          <button className="report-card" onClick={() => generate('availability')} disabled={loading}>
            <h3>Lot Availability Report</h3>
            <p>Lots by section with availability status</p>
          </button>
          <button className="report-card" onClick={() => generate('payments')} disabled={loading}>
            <h3>Payments Report</h3>
            <p>Recorded payments and totals by method</p>
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
                <tr><th>ID</th><th>Lot</th><th>Client</th><th>Date</th><th className="num">Amount</th><th>Approval</th></tr>
              </thead>
              <tbody>
                {report.items.map((r) => (
                  <tr key={r.reservation_id}>
                    <td>{r.reservation_id}</td>
                    <td>{r.lot_code}</td>
                    <td>{r.user_name}</td>
                    <td>{longDate(r.reservation_date)}</td>
                    <td className="num">{money(r.total_amount)}</td>
                    <td><StatusBadge kind="approval" value={r.approved_status} /></td>
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
                    <td>{longDate(b.burial_date)}</td>
                    <td>{label(BURIAL_TYPES, b.burial_type)}</td>
                    <td><StatusBadge kind="interment" value={b.interment_status} /></td>
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
          {report.total > report.items.length && (
            <p className="text-muted">Showing the first {report.items.length} of {report.total} lots.</p>
          )}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Lot Code</th><th>Section</th><th>Type</th><th>Block</th><th className="num">Price</th><th>Status</th></tr>
              </thead>
              <tbody>
                {report.items.map((l) => (
                  <tr key={l.lot_id}>
                    <td>{l.lot_code}</td>
                    <td>{l.section_name}</td>
                    <td>{label(LOT_TYPES, l.lot_type)}</td>
                    <td>{l.block || '—'}</td>
                    <td className="num">{money(l.price)}</td>
                    <td><StatusBadge kind="lot" value={l.status} /></td>
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
            <span>Total: {money(report.total)}</span>
            <span>Payments: {report.count}</span>
            <span>This month: {money(report.this_month)}</span>
          </div>
          {report.by_method.length > 0 && (
            <div className="report-stats">
              {report.by_method.map((m) => (
                <span key={m.method}>{label(PAYMENT_METHODS, m.method)}: {money(m.total)} ({m.count})</span>
              ))}
            </div>
          )}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Reservation</th><th>Client</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Recorded by</th></tr>
              </thead>
              <tbody>
                {report.items.map((p) => (
                  <tr key={p.payment_id}>
                    <td>{longDate(p.payment_date)}</td>
                    <td>{p.lot_code} <span className="text-muted">#{p.reservation_id}</span></td>
                    <td>{p.user_name}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{label(PAYMENT_METHODS, p.method)}</td>
                    <td>{p.reference_no || '—'}</td>
                    <td>{p.recorded_by_name || '—'}</td>
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
                    <td>{longDateTime(l.created_at)}</td>
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
