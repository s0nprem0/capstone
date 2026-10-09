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
      setSuccess(`Reservation #${data.reservation_id} submitted. The plot is held while it awaits approval.`)
      setForm({ lot_id: '', reservation_date: '', purpose: '', number_of_slots: 1 })
      setTouched({})
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
            {/* The dropdown lists bare codes, and the map is what makes a code
                mean anything. Point at it before the visitor has to guess. */}
            <span className="label-hint">
              <Link to="/">Browse the cemetery map</Link> to pick a plot by section.
            </span>
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

        {/* Without this the only feedback for picking a plot was Total: ₱0
            turning into a number. Spells out what was actually chosen. */}
        {selectedLot && (
          <dl className="figure-list reserve-summary">
            <div><dt>Plot</dt><dd>{selectedLot.lot_code}</dd></div>
            <div><dt>Section</dt><dd>{selectedLot.section_name}</dd></div>
            <div><dt>Type</dt><dd>{selectedLot.lot_type}</dd></div>
            <div><dt>Price</dt><dd>₱{Number(selectedLot.price).toLocaleString()}</dd></div>
            <div><dt>Capacity</dt><dd>{slotMax} {slotMax === 1 ? 'slot' : 'slots'}</dd></div>
          </dl>
        )}

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
    </div>
  )
}