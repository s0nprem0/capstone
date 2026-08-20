import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function NewReservation() {
  const { user } = useAuth()
  const [lots, setLots] = useState([])
  const [form, setForm] = useState({
    lot_id: '',
    reservation_date: '',
    purpose: '',
    number_of_slots: 1,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api('/api/lots').then(({ ok, data }) => {
      if (ok) setLots(data)
    })
  }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const lot = lots.find((l) => String(l.lot_id) === String(form.lot_id))
    const payload = {
      user_id: user.user_id,
      lot_id: form.lot_id,
      reservation_date: form.reservation_date,
      purpose: form.purpose,
      number_of_slots: Number(form.number_of_slots),
      total_amount: lot ? lot.price * Number(form.number_of_slots) : 0,
      payment_status: 'pending',
      approved_status: 'pending',
    }

    const { ok, data } = await api('/api/reservations', { method: 'POST', body: payload })
    if (ok) {
      setSuccess('Reservation submitted. Awaiting approval.')
      setForm({ lot_id: '', reservation_date: '', purpose: '', number_of_slots: 1 })
    } else {
      setError(data?.error || 'Failed to create reservation')
    }
  }

  const availableLots = lots.filter((l) => l.status === 'available')

  return (
    <div>
      <h2>New Reservation</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <label>
            Cemetery Lot
            <select name="lot_id" value={form.lot_id} onChange={handleChange} required>
              <option value="">Select an available lot</option>
              {availableLots.map((lot) => (
                <option key={lot.lot_id} value={lot.lot_id}>
                  {lot.lot_code} — ₱{Number(lot.price).toLocaleString()}
                </option>
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
            Number of Slots
            <input type="number" min="1" name="number_of_slots" value={form.number_of_slots} onChange={handleChange} required />
          </label>
        </div>
        <div className="form-actions">
          <Link to="/reservations" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary">Submit Reservation</button>
        </div>
      </form>
    </div>
  )
}