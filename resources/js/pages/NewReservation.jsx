import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const SLOT_CAPACITY = { single: 1, double: 2, family: 4 }

// Local date, not toISOString(): that is UTC, which rejects today's date for
// anyone east of Greenwich during their own morning.
const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function NewReservation() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [sections, setSections] = useState([])
  const [form, setForm] = useState({
    lot_id: searchParams.get('lot') || '',
    reservation_date: '',
    purpose: '',
    number_of_slots: 1,
  })
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const [pay, setPay] = useState({ amount: '', method: 'gcash', reference_no: '', receipt: null })

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (ok && data?.sections) setSections(data.sections)
    })
  }, [])

  const grouped = sections
    .map((s) => ({
      section: s,
      lots: (s.lots || []).filter((l) => l.status === 'available'),
    }))
    .filter((g) => g.lots.length > 0)

  const lots = grouped.flatMap((g) => g.lots)
  const selectedLot = lots.find((l) => String(l.lot_id) === String(form.lot_id))
  const slotMax = selectedLot ? SLOT_CAPACITY[selectedLot.lot_type] || 1 : null
  const slots = Math.max(1, Number(form.number_of_slots) || 1)
  const totalAmount = selectedLot ? Number(selectedLot.price) * slots : 0

  // A ?lot= deep link can outlive the lot it points at. Gated on the map having
  // loaded, otherwise every deep link reports as stale for the first frame.
  const staleLot = sections.length > 0 && form.lot_id !== '' && !selectedLot

  const errors = {}
  if (!form.lot_id) errors.lot_id = 'Select a lot.'
  else if (staleLot) errors.lot_id = 'That lot is no longer available.'
  if (!form.reservation_date) errors.reservation_date = 'Pick a reservation date.'
  else if (form.reservation_date < todayISO()) errors.reservation_date = 'The date cannot be in the past.'

  const show = (name) => touched[name] && errors[name]
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'number_of_slots') {
      const next = Number(value) || 1
      setForm((prev) => ({
        ...prev,
        number_of_slots: slotMax ? Math.max(1, Math.min(next, slotMax)) : next,
      }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleLotChange = (e) => {
    const lot = lots.find((l) => String(l.lot_id) === e.target.value)
    const max = lot ? SLOT_CAPACITY[lot.lot_type] || 1 : null
    setForm((prev) => ({
      ...prev,
      lot_id: e.target.value,
      number_of_slots: max ? Math.min(Number(prev.number_of_slots) || 1, max) : prev.number_of_slots,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setTouched({ lot_id: true, reservation_date: true })
    if (errors.lot_id || errors.reservation_date) return
    setSubmitting(true)

    const { ok, data } = await api('/api/reservations', {
      method: 'POST',
      body: {
        user_id: user.user_id,
        lot_id: form.lot_id,
        reservation_date: form.reservation_date,
        purpose: form.purpose,
        number_of_slots: slots,
      },
    })
    setSubmitting(false)
    if (ok) {
      setSuccess('Reservation submitted. Awaiting approval.')
      setForm({ lot_id: '', reservation_date: '', purpose: '', number_of_slots: 1 })
      setTouched({})
      setPay({ amount: String(data.total_amount), method: 'gcash', reference_no: '', receipt: null })
      setCreated(data)
    } else {
      setError(data?.error || 'Failed to create reservation')
    }
  }

  const handlePayChange = (e) => {
    const { name, value } = e.target
    setPay((prev) => ({ ...prev, [name]: value }))
  }

  const submitPayment = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    const amount = Number(pay.amount)
    if (!amount || amount <= 0) {
      setError('Enter a payment amount')
      setSubmitting(false)
      return
    }

    const { ok, data } = await api('/api/payments', {
      method: 'POST',
      body: {
        reservation_id: created.reservation_id,
        amount,
        payment_method: pay.method,
        reference_no: pay.reference_no || undefined,
      },
    })
    if (!ok) {
      setError(data?.error || 'Failed to record payment')
      setSubmitting(false)
      return
    }

    if (pay.receipt) {
      const fd = new FormData()
      fd.append('receipt', pay.receipt)
      const up = await api(`/api/payments/${data.payment_id}/upload-receipt`, { method: 'POST', body: fd })
      if (!up.ok) {
        setError(up.data?.error || 'Payment recorded, but the receipt upload failed. Upload it later from My Payments.')
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    setSuccess('Payment recorded and receipt uploaded. Track the status from My Reservations.')
    setPay({ amount: '', method: 'gcash', reference_no: '', receipt: null })
    setCreated(null)
  }

  return (
    <div>
      <h2>Reserve a Lot</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      {grouped.length === 0 && (
        <p className="text-muted">No available lots at the moment. Please check back later.</p>
      )}

      <form onSubmit={handleSubmit} className="form-card" noValidate>
        <div className="form-grid">
          <div className="field">
            <label>
              Cemetery Lot
              <select
                name="lot_id"
                value={form.lot_id}
                onChange={handleLotChange}
                onBlur={() => blur('lot_id')}
                aria-invalid={!!show('lot_id')}
                required
              >
                <option value="">Select an available lot</option>
                {grouped.map((g) => (
                  <optgroup key={g.section.section_id} label={g.section.section_name}>
                    {g.lots.map((lot) => (
                      <option key={lot.lot_id} value={lot.lot_id}>
                        {lot.lot_code} — ₱{Number(lot.price).toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {/* Staleness shows on its own — it is a data condition, not a
                field the visitor has just left. */}
            {(staleLot || show('lot_id')) && (
              <span className="field-error" role="alert">{errors.lot_id}</span>
            )}
          </div>
          <div className="field">
            <label>
              Reservation Date
              <input
                type="date"
                name="reservation_date"
                value={form.reservation_date}
                onChange={handleChange}
                onBlur={() => blur('reservation_date')}
                aria-invalid={!!show('reservation_date')}
                min={todayISO()}
                required
              />
            </label>
            {show('reservation_date') && (
              <span className="field-error" role="alert">{errors.reservation_date}</span>
            )}
          </div>
          <div className="field">
            <label>
              Purpose
              <input name="purpose" value={form.purpose} onChange={handleChange} maxLength={100} />
            </label>
          </div>
          <div className="field">
            <label>
              Number of Slots{slotMax && <span className="label-hint">(max {slotMax})</span>}
              <input
                type="number"
                min="1"
                max={slotMax || undefined}
                name="number_of_slots"
                value={form.number_of_slots}
                onChange={handleChange}
                required
              />
            </label>
          </div>
        </div>
        <div className="form-actions">
          <p className="total-display">
            Total: <strong>₱{totalAmount.toLocaleString()}</strong>
          </p>
          <Link to="/visitor/reservations" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Reservation'}
          </button>
        </div>
      </form>

      {created && (
        <div className="form-card section-block">
          <h3>Pay &amp; upload receipt</h3>
          <p className="text-muted">
            Reservation #{created.reservation_id} was created. Record the payment and attach the manual
            receipt to complete the booking — or do it later from My Payments.
          </p>
          <form onSubmit={submitPayment}>
            <div className="form-grid">
              <label>
                Amount (₱)
                <input type="number" name="amount" value={pay.amount} onChange={handlePayChange} min="1" step="0.01" required />
              </label>
              <label>
                Method
                <select name="method" value={pay.method} onChange={handlePayChange}>
                  <option value="gcash">GCash</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label>
                Reference No.
                <input type="text" name="reference_no" value={pay.reference_no} onChange={handlePayChange} placeholder="Optional" />
              </label>
              <label>
                Receipt (JPG/PNG/PDF)
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setPay((prev) => ({ ...prev, receipt: file }))
                  }}
                />
              </label>
            </div>
            <div className="form-actions">
              <Link to="/visitor/reservations" className="btn btn-secondary">Pay Later</Link>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}