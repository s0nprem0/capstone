import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import useList from '../lib/useList'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import Notice, { useNotice } from '../components/Notice'
import PageHeader from '../components/PageHeader'
import OccupancyBar from '../components/OccupancyBar'
import RowMenu from '../components/RowMenu'

const EMPTY_FORM = { section_name: '', location: '', description: '', svg_viewbox: '0 0 4096 3072' }

export default function Sections() {
  // One form for adding and editing: null when closed, {} when adding, the
  // section when editing. Two forms used to stack up at the top of the page.
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const { items: sections, loaded, error, reload } = useList('/api/sections', {}, 'Failed to load sections')
  const { notice, succeed, fail, clear } = useNotice()

  const isNew = editing && !editing.section_id

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const openAdd = () => {
    clear()
    setEditing({})
    setForm(EMPTY_FORM)
  }

  const openEdit = (s) => {
    clear()
    setEditing(s)
    setForm({
      section_name: s.section_name || '',
      location: s.location || '',
      description: s.description || '',
      svg_viewbox: s.svg_viewbox || EMPTY_FORM.svg_viewbox,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clear()
    setSaving(true)
    const url = isNew ? '/api/sections' : `/api/sections/${editing.section_id}`
    const { ok, data } = await api(url, { method: 'POST', body: form })
    setSaving(false)
    if (ok) {
      succeed(isNew ? `Created ${data.section_name}.` : `Updated ${data.section_name}.`)
      setEditing(null)
      reload()
    } else {
      fail(data?.error || (isNew ? 'Failed to create section' : 'Failed to update section'))
    }
  }

  const handleDelete = async (s) => {
    clear()
    setBusyId(s.section_id)
    const { ok, data } = await api(`/api/sections/${s.section_id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      succeed(`Deleted ${s.section_name}.`)
      reload()
    } else {
      fail(data?.error || 'Delete failed')
    }
  }

  const reflowLots = async (s) => {
    const key = `reflow-${s.section_id}`
    clear()
    setBusyId(key)
    const { ok, data } = await api('/api/lots/regrid', { method: 'POST', body: { section_id: s.section_id } })
    setBusyId(null)
    if (ok) {
      succeed(`Reflowed ${data.updated} lot${data.updated === 1 ? '' : 's'} into ${s.section_name}'s outline.`)
      reload()
    } else {
      fail(data?.error || 'Reflow failed')
    }
  }

  const toggleLock = async (s) => {
    const key = `lock-${s.section_id}`
    clear()
    setBusyId(key)
    const { ok, data } = await api(`/api/sections/${s.section_id}`, { method: 'POST', body: { is_locked: !s.is_locked } })
    setBusyId(null)
    if (ok) {
      succeed(data.is_locked ? `Locked ${data.section_name} — outline and lot geometry are frozen.` : `Unlocked ${data.section_name}.`)
      reload()
    } else {
      fail(data?.error || 'Failed to update lock')
    }
  }

  return (
    <div>
      <PageHeader title="Sections">
        {!editing && <button className="btn btn-primary" onClick={openAdd}>Add Section</button>}
      </PageHeader>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      {editing && (
        <form onSubmit={handleSubmit} className="form-card section-block">
          <h3>{isNew ? 'Add Section' : `Edit Section — ${editing.section_name}`}</h3>
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
              Description
              <textarea name="description" value={form.description} onChange={handleChange} />
            </label>
          </div>
          {/* The crop region is set by drawing the outline in the section
              editor; typing coordinates is the fallback, not the way in. */}
          {!isNew && (
            <details className="form-advanced">
              <summary>Advanced</summary>
              <label>
                SVG View Box
                <input name="svg_viewbox" value={form.svg_viewbox} onChange={handleChange} />
                <small className="label-hint">Crop region as "x y width height". Normally set by editing the outline.</small>
              </label>
            </details>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isNew ? 'Add Section' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {!loaded && !error && <Loading message="Loading sections..." />}

      {loaded && !error && sections.length === 0 && <EmptyState noun="sections" />}

      {loaded && !error && sections.length > 0 && (
      <div className="table-container section-block">
        <table className="table">
          <caption className="visually-hidden">Cemetery sections</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Plots</th>
              <th><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
                <tr key={s.section_id}>
                  <td>
                    {s.section_name}
                    {Boolean(s.is_locked) && <span className="cell-sub">Locked</span>}
                  </td>
                  <td>{s.location || '—'}</td>
                  <td className="section-plots">
                    <OccupancyBar counts={s} />
                    <span className="cell-sub">
                      {s.available} free of {s.lot_count}
                      {s.reserved > 0 && ` · ${s.reserved} reserved`}
                      {s.occupied > 0 && ` · ${s.occupied} occupied`}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <RowMenu>
                        {(close) => (
                          <>
                            <Link to={`/admin/sections/editor?section=${s.section_id}`} className="row-menu-item">
                              {s.is_locked ? 'View outline' : 'Edit outline'}
                            </Link>
                            <Link to={`/admin/lots?section=${s.section_id}`} className="row-menu-item">
                              Edit lots
                            </Link>
                            <ConfirmButton
                              label="Reflow lots"
                              className="row-menu-item"
                              disabled={Boolean(s.is_locked) || busyId === `reflow-${s.section_id}`}
                              busy={busyId === `reflow-${s.section_id}`}
                              confirmLabel="Reflow"
                              message="Redraw every lot as a grid inside the outline?"
                              onConfirm={async () => { await reflowLots(s); close(false) }}
                            />
                            <button
                              type="button"
                              className="row-menu-item"
                              disabled={busyId === `lock-${s.section_id}`}
                              onClick={async () => { await toggleLock(s); close(false) }}
                            >
                              {s.is_locked ? 'Unlock' : 'Lock'}
                            </button>
                            <ConfirmButton
                              label="Delete"
                              className="row-menu-item row-menu-item--danger"
                              danger
                              disabled={Boolean(s.is_locked)}
                              onConfirm={async () => { await handleDelete(s); close(false) }}
                              busy={busyId === s.section_id}
                              message={`Delete ${s.section_name}? Only empty sections can be deleted.`}
                            />
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
