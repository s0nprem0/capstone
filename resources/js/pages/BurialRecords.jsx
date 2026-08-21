import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function BurialRecords() {
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    deceased_fullname: '', date_of_birth: '', date_of_death: '',
    burial_date: '', lot_id: '', burial_type: 'single',
    next_of_kin_name: '', next_of_kin_phone: '', interment_status: 'scheduled',
  })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    const { ok, data } = await api('/api/burial-records')
    if (ok) setRecords(data)
    else setError(data?.error || 'Failed to load burial records')
  }

  useEffect(() => { load() }, [])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const openCreate = () => {
    setEditId(null)
    setForm({
      deceased_fullname: '', date_of_birth: '', date_of_death: '',
      burial_date: '', lot_id: '', burial_type: 'single',
      next_of_kin_name: '', next_of_kin_phone: '', interment_status: 'scheduled',
    })
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditId(r.burial_id)
    setForm({
      deceased_fullname: r.deceased_fullname,
      date_of_birth: r.date_of_birth || '',
      date_of_death: r.date_of_death || '',
      burial_date: r.burial_date,
      lot_id: r.lot_id,
      burial_type: r.burial_type,
      next_of_kin_name: r.next_of_kin_name || '',
      next_of_kin_phone: r.next_of_kin_phone || '',
      interment_status: r.interment_status,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const body = { ...form, lot_id: Number(form.lot_id) }
    const url = editId ? `/api/burial-records/${editId}` : '/api/burial-records'
    const { ok, data } = await api(url, { method: 'POST', body })
    setSubmitting(false)
    if (ok) { setShowForm(false); load() }
    else setError(data?.error || 'Failed to save')
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this burial record?')) return
    const { ok, data } = await api(`/api/burial-records/${id}/delete`, { method: 'POST' })
    if (ok) load()
    else setError(data?.error || 'Delete failed')
  }

  return (
    <div>
      <div className="page-header">
        <h2>Burial Records</h2>
        <button className="btn btn-primary" onClick={openCreate}>New Record</button>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {showForm && (
        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Deceased Full Name
                <input type="text" name="deceased_fullname" value={form.deceased_fullname} onChange={handleChange} required />
              </label>
              <label>
                Lot ID
                <input type="number" name="lot_id" value={form.lot_id} onChange={handleChange} required />
              </label>
              <label>
                Burial Date
                <input type="date" name="burial_date" value={form.burial_date} onChange={handleChange} required />
              </label>
              <label>
                Burial Type
                <select name="burial_type" value={form.burial_type} onChange={handleChange}>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="family">Family</option>
                  <option value="cremation">Cremation</option>
                </select>
              </label>
              <label>
                Date of Birth
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
              </label>
              <label>
                Date of Death
                <input type="date" name="date_of_death" value={form.date_of_death} onChange={handleChange} />
              </label>
              <label>
                Next of Kin Name
                <input type="text" name="next_of_kin_name" value={form.next_of_kin_name} onChange={handleChange} />
              </label>
              <label>
                Next of Kin Phone
                <input type="text" name="next_of_kin_phone" value={form.next_of_kin_phone} onChange={handleChange} />
              </label>
              <label>
                Interment Status
                <select name="interment_status" value={form.interment_status} onChange={handleChange}>
                  <option value="scheduled">Scheduled</option>
                  <option value="interred">Interred</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        {records.length === 0 ? (
          <p className="text-muted">No burial records yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Deceased</th>
                <th>Lot</th>
                <th>Section</th>
                <th>Burial Date</th>
                <th>Type</th>
                <th>Next of Kin</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.burial_id}>
                  <td>{r.burial_id}</td>
                  <td>{r.deceased_fullname}</td>
                  <td>{r.lot_code}</td>
                  <td>{r.section_name}</td>
                  <td>{r.burial_date}</td>
                  <td>{r.burial_type}</td>
                  <td>{r.next_of_kin_name || '—'}</td>
                  <td><span className={`badge badge--${r.interment_status === 'interred' ? 'paid' : 'pending'}`}>{r.interment_status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(r.burial_id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
