import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function Payments() {
  const { user } = useAuth()
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ reservation_id: '', amount: '', payment_method: 'gcash', reference_no: '' })
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(null)

  const load = async () => {
    const path = user?.role === 'user' ? '/api/payments/mine' : '/api/payments'
    const { ok, data } = await api(path)
    if (ok) setPayments(data)
    else setError(data?.error || 'Failed to load payments')
  }

  useEffect(() => {
    load()
  }, [user])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const { ok, data } = await api('/api/payments', {
      method: 'POST',
      body: {
        reservation_id: Number(form.reservation_id),
        amount: Number(form.amount),
        payment_method: form.payment_method,
        reference_no: form.reference_no || undefined,
      },
    })
    setSubmitting(false)
    if (ok) {
      setShowForm(false)
      setForm({ reservation_id: '', amount: '', payment_method: 'gcash', reference_no: '' })
      load()
    } else {
      setError(data?.error || 'Failed to create payment')
    }
  }

  const validatePayment = async (id, status) => {
    setValidating(id)
    const { ok, data } = await api(`/api/payments/${id}/validate`, {
      method: 'POST',
      body: { payment_status: status },
    })
    setValidating(null)
    if (ok) load()
    else setError(data?.error || 'Validation failed')
  }

  const isStaffView = user && user.role !== 'user'

  return (
    <div>
      <div className="page-header">
        <h2>{isStaffView ? 'All Payments' : 'My Payments'}</h2>
        {user?.role === 'user' && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Record Payment'}
          </button>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {showForm && (
        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Reservation ID
                <input type="number" name="reservation_id" value={form.reservation_id} onChange={handleChange} required />
              </label>
              <label>
                Amount (₱)
                <input type="number" name="amount" value={form.amount} onChange={handleChange} min="1" step="0.01" required />
              </label>
              <label>
                Method
                <select name="payment_method" value={form.payment_method} onChange={handleChange}>
                  <option value="gcash">GCash</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label>
                Reference No.
                <input type="text" name="reference_no" value={form.reference_no} onChange={handleChange} placeholder="Optional" />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {payments.length === 0 ? (
          <p className="text-muted">No payments yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Reservation</th>
                {isStaffView && <th>Client</th>}
                <th>Lot</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
                {isStaffView && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.payment_id}>
                  <td>{p.payment_id}</td>
                  <td>#{p.reservation_id}</td>
                  {isStaffView && <td>{p.user_name}</td>}
                  <td>{p.lot_code}</td>
                  <td>₱{Number(p.amount).toLocaleString()}</td>
                  <td>{p.payment_method}</td>
                  <td>{p.reference_no || '—'}</td>
                  <td><span className={`badge badge--${p.payment_status}`}>{p.payment_status}</span></td>
                  {isStaffView && p.payment_status === 'pending' && (
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={validating === p.payment_id}
                        onClick={() => validatePayment(p.payment_id, 'paid')}
                      >
                        Approve
                      </button>{' '}
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={validating === p.payment_id}
                        onClick={() => validatePayment(p.payment_id, 'failed')}
                      >
                        Reject
                      </button>
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
