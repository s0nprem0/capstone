import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const SLOT_CAPACITY = { single: 1, double: 2, family: 4 }

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
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    } else {
      setError(data?.error || 'Failed to create reservation')
    }
  }

  return (
    <div>
      <h2>Reserve a Lot</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      {grouped.length === 0 && (
        <p className="text-muted">No available lots at the moment. Please check back later.</p>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <label>
            Cemetery Lot
            <select name="lot_id" value={form.lot_id} onChange={handleLotChange} required>
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
          <label>
            Reservation Date
            <input type="date" name="reservation_date" value={form.reservation_date} onChange={handleChange} required />
          </label>
          <label>
            Purpose
            <input name="purpose" value={form.purpose} onChange={handleChange} />
          </label>
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
        <div className="form-actions">
          <p className="total-display">
            Total: <strong>₱{totalAmount.toLocaleString()}</strong>
          </p>
          <Link to="/visitor/reservations" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={submitting || !selectedLot}>
            {submitting ? 'Submitting...' : 'Submit Reservation'}
          </button>
        </div>
      </form>
    </div>
  )
}