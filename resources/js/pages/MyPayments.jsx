import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import TableSkeleton from '../components/TableSkeleton'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ExportActions from '../components/ExportActions'
import Blank from '../components/Blank'
import { PAYMENT_METHODS, label, longDate, money } from '../lib/terms'

// What the office has recorded against the visitor's own reservations. Nothing
// is paid here: the system monitors payments, it does not take them.
export default function MyPayments() {
  const [payments, setPayments] = useState([])
  const [reservations, setReservations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/api/payments/mine'), api('/api/reservations/mine')]).then(([p, r]) => {
      if (p.ok && r.ok) {
        setPayments(p.data)
        // A rejected, expired or cancelled request owes nothing, unless something
        // was already paid against it and the office still has to settle it.
        setReservations(r.data.filter((x) => ['pending', 'approved'].includes(x.approved_status) || Number(x.amount_paid) > 0))
      } else {
        setError((p.ok ? r : p).data?.error || 'Failed to load your payments')
      }
      setLoaded(true)
    })
  }, [])

  const booked = reservations.reduce((sum, r) => sum + Number(r.total_amount), 0)
  const paid = reservations.reduce((sum, r) => sum + Number(r.amount_paid), 0)

  const columns = [
    { label: 'Payment date', value: (p) => p.payment_date },
    { label: 'Reservation', value: (p) => p.reservation_id },
    { label: 'Plot', value: (p) => p.lot_code },
    { label: 'Amount', value: (p) => Number(p.amount) },
    { label: 'Method', value: (p) => label(PAYMENT_METHODS, p.method) },
    { label: 'Reference', value: (p) => p.reference_no },
  ]

  return (
    <div>
      <PageHeader title="My Payments">
        <ExportActions name="my-payments" columns={columns} rows={payments} describe="Payment history" />
      </PageHeader>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!loaded && !error && <TableSkeleton label="Loading your payments..." columns={5} />}

      {loaded && !error && (
        <div className="dash section-block">
          <section className="dash-panel" aria-labelledby="pay-balance">
            <h3 id="pay-balance">Balance</h3>
            <p className="text-muted panel-note">
              Payments are made at the cemetery office by cash, GCash, bank transfer or cheque. Mention your
              reservation number so the office records it against the right plot.
            </p>
            <div className="stat-row">
              <div className="stat-tile">
                <p className="stat-label">Total booked</p>
                <p className="stat-value">{money(booked)}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Paid</p>
                <p className="stat-value">{money(paid)}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Balance due</p>
                <p className="stat-value">{money(Math.max(0, booked - paid))}</p>
              </div>
            </div>

            {reservations.length === 0 ? (
              <EmptyState noun="reservations" action={{ label: 'Reserve a Lot', to: '/visitor/reserve' }} />
            ) : (
              <table className="table table--stack report-table">
                <caption className="visually-hidden">Balance per reservation</caption>
                <thead>
                  <tr>
                    <th>Reservation</th>
                    <th className="num">Total</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.reservation_id}>
                      <td data-label="Reservation">
                        <Link to={`/?lot=${r.lot_id}`} title="Show on the cemetery map">{r.lot_code}</Link>
                        <span className="text-muted"> #{r.reservation_id}</span>
                      </td>
                      <td data-label="Total" className="num">{money(r.total_amount)}</td>
                      <td data-label="Paid" className="num">{money(r.amount_paid)}</td>
                      <td data-label="Balance" className="num">
                        {money(Math.max(0, Number(r.total_amount) - Number(r.amount_paid)))}
                      </td>
                      <td data-label="Payment"><StatusBadge kind="payment" value={r.payment_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="dash-panel" aria-labelledby="pay-history">
            <h3 id="pay-history">Payment history</h3>
            {payments.length === 0 ? (
              <EmptyState noun="payments recorded" />
            ) : (
              <table className="table table--stack report-table">
                <caption className="visually-hidden">Payments recorded against your reservations</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reservation</th>
                    <th className="num">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.payment_id}>
                      <td data-label="Date">{longDate(p.payment_date)}</td>
                      <td data-label="Reservation">
                        {p.lot_code}
                        <span className="text-muted"> #{p.reservation_id}</span>
                      </td>
                      <td data-label="Amount" className="num">{money(p.amount)}</td>
                      <td data-label="Method">{label(PAYMENT_METHODS, p.method)}</td>
                      <td data-label="Reference">{p.reference_no || <Blank />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
