import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import { STATUS_COLORS } from '../components/CemeterySvgMap'

const EMPTY_FORM = { section_name: '', location: '', description: '', svg_viewbox: '0 0 1791 1457' }

export default function Sections() {
  const [sections, setSections] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)
  const [savingAdd, setSavingAdd] = useState(false)

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    const { ok, data } = await api('/api/sections')
    if (ok) setSections(data)
    else setError(data?.error || 'Failed to load sections')
  }

  useEffect(() => {
    load()
  }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSavingAdd(true)
    const { ok, data } = await api('/api/sections', { method: 'POST', body: form })
    setSavingAdd(false)
    if (ok) {
      setSuccess(`Created ${data.section_name}`)
      setForm(EMPTY_FORM)
      load()
    } else {
      setError(data?.error || 'Failed to create section')
    }
  }

  const openEdit = (s) => {
    setEditing(s)
    setEditForm({ ...s })
    setError('')
    setSuccess('')
  }

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value })

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editing) return
    setError('')
    setSuccess('')
    setSavingEdit(true)
    const body = { ...editForm }
    delete body.section_id
    const { ok, data } = await api(`/api/sections/${editing.section_id}`, { method: 'POST', body })
    setSavingEdit(false)
    if (ok) {
      setSuccess(`Updated ${data.section_name}`)
      setEditing(null)
      load()
    } else {
      setError(data?.error || 'Failed to update section')
    }
  }

  const handleDelete = async (s) => {
    setBusyId(s.section_id)
    const { ok, data } = await api(`/api/sections/${s.section_id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      setSuccess(`Deleted ${s.section_name}`)
      load()
    } else {
      setError(data?.error || 'Delete failed')
    }
  }

  const countBadge = (count, status) => (
    <span
      className="badge"
      style={{ background: `${STATUS_COLORS[status]}22`, color: STATUS_COLORS[status] }}
      title={`${status} lots`}
    >
      {status}: {count}
    </span>
  )

  return (
    <div>
      <h2>Section Management</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      <form onSubmit={handleSubmit} className="form-card form-card--compact">
        <h3>Add Section</h3>
        <div className="form-grid">
          <label>
            Section Name
            <input name="section_name" value={form.section_name} onChange={handleChange} maxLength="50" required />
          </label>
          <label>
            Location
            <input name="location" value={form.location} onChange={handleChange} maxLength="100" />
          </label>
          <label>
            SVG View Box
            <input name="svg_viewbox" value={form.svg_viewbox} onChange={handleChange} />
            <small className="label-hint">Crop region as "x y width height", e.g. 280 270 1320 350.</small>
          </label>
          <label>
            Description
            <textarea name="description" value={form.description} onChange={handleChange} />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={savingAdd}>
            {savingAdd ? 'Adding...' : 'Add Section'}
          </button>
        </div>
      </form>

      {editing && (
        <form onSubmit={handleEditSubmit} className="form-card section-block">
          <h3>Edit Section — {editing.section_name}</h3>
          <div className="form-grid">
            <label>
              Section Name
              <input name="section_name" value={editForm.section_name} onChange={handleEditChange} maxLength="50" required />
            </label>
            <label>
              Location
              <input name="location" value={editForm.location} onChange={handleEditChange} maxLength="100" />
            </label>
            <label>
              SVG View Box
              <input name="svg_viewbox" value={editForm.svg_viewbox} onChange={handleEditChange} />
              <small className="label-hint">Crop region as "x y width height".</small>
            </label>
            <label>
              Description
              <textarea name="description" value={editForm.description} onChange={handleEditChange} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      <div className="table-container section-block">
        <table className="table">
          <caption className="visually-hidden">Cemetery sections</caption>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Location</th>
              <th>Lots</th>
              <th>Status</th>
              <th>View Box</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">No sections found.</td>
              </tr>
            ) : (
              sections.map((s) => (
                <tr key={s.section_id}>
                  <td>{s.section_id}</td>
                  <td>{s.section_name}</td>
                  <td>{s.location || '—'}</td>
                  <td>{s.lot_count}</td>
                  <td>
                    <div className="table-actions">
                      {countBadge(s.available, 'available')}
                      {countBadge(s.reserved, 'reserved')}
                      {countBadge(s.occupied, 'occupied')}
                    </div>
                  </td>
                  <td><code>{s.svg_viewbox}</code></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <ConfirmButton
                        label="Delete"
                        danger
                        onConfirm={() => handleDelete(s)}
                        busy={busyId === s.section_id}
                        message={`Delete ${s.section_name}? Only empty sections can be deleted.`}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}