import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import SectionEditor from '../components/SectionEditor'

const EMPTY_FORM = { section_name: '', location: '', description: '' }

export default function Sections() {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [savingAdd, setSavingAdd] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  const [busyId, setBusyId] = useState(null)
  const [editor, setEditor] = useState(null) // { focus: sectionId|null } when the map editor is open

  const load = async () => {
    const { ok, data } = await api('/api/sections')
    if (ok) setSections(data)
    else setError(data?.error || 'Failed to load sections')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const notify = (fn) => {
    setError('')
    setSuccess('')
    fn()
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSavingAdd(true)
    const { ok, data } = await api('/api/sections', { method: 'POST', body: form })
    setSavingAdd(false)
    if (ok) {
      setSuccess(`Added ${data.section_name} — map its outline below.`)
      setForm(EMPTY_FORM)
      setAdding(false)
      load()
    } else {
      setError(data?.error || 'Failed to add section')
    }
  }

  const openEdit = (s) => {
    notify(() =>
      setEditForm({
        section_name: s.section_name,
        location: s.location || '',
        description: s.description || '',
      })
    )
    setEditingId(s.section_id)
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (editingId == null) return
    setError('')
    setSuccess('')
    setSavingEdit(true)
    const { ok, data } = await api(`/api/sections/${editingId}`, { method: 'POST', body: editForm })
    setSavingEdit(false)
    if (ok) {
      setSuccess(`Updated ${data.section_name}`)
      setEditingId(null)
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

  const reflowLots = async (s) => {
    const key = `reflow-${s.section_id}`
    setError('')
    setSuccess('')
    setBusyId(key)
    const { ok, data } = await api('/api/lots/regrid', { method: 'POST', body: { section_id: s.section_id } })
    setBusyId(null)
    if (ok) {
      setSuccess(
        `Reflowed ${data.updated} lot${data.updated === 1 ? '' : 's'} into ${s.section_name}'s outline.`
      )
      load()
    } else {
      setError(data?.error || 'Reflow failed')
    }
  }

  const deleteMessage = (s) =>
    s.lot_count > 0
      ? `Delete ${s.section_name} and its ${s.lot_count} lot(s)? This is only allowed while no lot is reserved or occupied.`
      : `Delete ${s.section_name}?`

  const vertexCount = (s) =>
    s.svg_points && s.svg_points.trim() ? Math.round(s.svg_points.trim().split(/\s+/).length / 2) : null

  if (editor) {
    return (
      <div>
        <div className="page-header">
          <h2>Section Map Editor</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setEditor(null)}>
            ← Back to sections
          </button>
        </div>
        <SectionEditor
          sections={sections}
          focusSectionId={editor.focus}
          onSaved={() => {
            setEditor(null)
            setSuccess('Section outlines saved')
            load()
          }}
          onCancel={() => setEditor(null)}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>Section Management</h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditor({ focus: null })}>
            ✎ Edit outlines on map
          </button>
          <button type="button" className="btn btn-primary" onClick={() => notify(() => setAdding((v) => !v))}>
            {adding ? 'Cancel' : 'Add Section'}
          </button>
        </div>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      {adding && (
        <form onSubmit={handleAdd} className="form-card form-card--compact">
          <h3>Add Section</h3>
          <div className="form-grid">
            <label>
              Section Name
              <input name="section_name" value={form.section_name} onChange={(e) => setForm({ ...form, section_name: e.target.value })} required maxLength="50" />
            </label>
            <label>
              Location
              <input name="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength="100" placeholder="e.g. North wing" />
            </label>
            <label>
              Description
              <input name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. General burial plots" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={savingAdd}>
              {savingAdd ? 'Adding...' : 'Add Section'}
            </button>
          </div>
        </form>
      )}

      {editingId != null && (
        <form onSubmit={handleEdit} className="form-card section-block">
          <h3>Edit Section — {editForm.section_name}</h3>
          <div className="form-grid">
            <label>
              Section Name
              <input name="section_name" value={editForm.section_name} onChange={(e) => setEditForm({ ...editForm, section_name: e.target.value })} required maxLength="50" />
            </label>
            <label>
              Location
              <input name="location" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} maxLength="100" />
            </label>
            <label>
              Description
              <input name="description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-muted">Loading sections...</p>}

      <div className="table-container section-block">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Lots</th>
              <th>Outline (viewBox)</th>
              <th>Vertices</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.section_id}>
                <td>{s.section_name}</td>
                <td>{s.location || '—'}</td>
                <td>{s.lot_count}</td>
                <td className="text-muted">{s.svg_viewbox}</td>
                <td>{vertexCount(s) ?? '—'}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor({ focus: s.section_id })}>
                      Map outline
                    </button>
                    <Link to={`/admin/lots?section=${s.section_id}`} className="btn btn-secondary btn-sm">
                      Edit lots
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === `reflow-${s.section_id}`}
                      onClick={() => reflowLots(s)}
                    >
                      {busyId === `reflow-${s.section_id}` ? 'Reflowing...' : 'Reflow lots'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>
                      Edit
                    </button>
                    <ConfirmButton
                      label="Delete"
                      danger
                      onConfirm={() => handleDelete(s)}
                      busy={busyId === s.section_id}
                      message={deleteMessage(s)}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sections.length === 0 && (
              <tr>
                <td colSpan="6" className="text-muted">No sections yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}