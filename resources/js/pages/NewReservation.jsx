import { useState } from 'react'

export default function NewReservation() {
  const [form, setForm] = useState({
    deceased_name: '',
    date_of_birth: '',
    date_of_death: '',
    lot_number: '',
    section: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    relationship: '',
  })

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    console.log('Submit:', form)
  }

  return (
    <div>
      <h2>New Reservation</h2>
      <form onSubmit={handleSubmit} className="form-card">
        <fieldset>
          <legend>Deceased Information</legend>
          <div className="form-grid">
            <label>
              Full Name
              <input name="deceased_name" value={form.deceased_name} onChange={handleChange} required />
            </label>
            <label>
              Date of Birth
              <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
            </label>
            <label>
              Date of Death
              <input type="date" name="date_of_death" value={form.date_of_death} onChange={handleChange} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Lot Information</legend>
          <div className="form-grid">
            <label>
              Section
              <input name="section" value={form.section} onChange={handleChange} required />
            </label>
            <label>
              Lot Number
              <input name="lot_number" value={form.lot_number} onChange={handleChange} required />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Contact Information</legend>
          <div className="form-grid">
            <label>
              Contact Name
              <input name="contact_name" value={form.contact_name} onChange={handleChange} required />
            </label>
            <label>
              Email
              <input type="email" name="contact_email" value={form.contact_email} onChange={handleChange} />
            </label>
            <label>
              Phone
              <input name="contact_phone" value={form.contact_phone} onChange={handleChange} />
            </label>
            <label>
              Relationship
              <input name="relationship" value={form.relationship} onChange={handleChange} />
            </label>
          </div>
        </fieldset>

        <div className="form-actions">
          <a href="/reservations" className="btn btn-secondary">Cancel</a>
          <button type="submit" className="btn btn-primary">Create Reservation</button>
        </div>
      </form>
    </div>
  )
}
