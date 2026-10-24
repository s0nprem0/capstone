import { useMemo, useState } from 'react'
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

const FILTERS = [
  { value: 'all', label: 'All sections' },
  { value: 'free', label: 'With plots available' },
  { value: 'full', label: 'Full' },
  { value: 'locked', label: 'Locked' },
]

const num = (value) => Number(value) || 0

// A plot count can be a fraction of a percent of the whole. Rounding that to
// "0% occupied" reads as "nothing is occupied" while the bar shows otherwise.
const percent = (part, whole) => {
  if (!whole) return '0%'
  const value = (part / whole) * 100
  if (value > 0 && value < 1) return '<1%'
  return `${Math.round(value)}%`
}

// The plan numbers sections; sections added by hand have none and belong after
// the surveyed ones. Matches the map's ordering, so the register, the map and
// this list read in the same sequence.
const planOrder = (a, b) => {
  const an = a.section_number == null ? Number.POSITIVE_INFINITY : Number(a.section_number)
  const bn = b.section_number == null ? Number.POSITIVE_INFINITY : Number(b.section_number)
  if (an !== bn) return an - bn
  return String(a.section_name).localeCompare(String(b.section_name), undefined, { numeric: true })
}

export default function Sections() {
  // One form for adding and editing: null when closed, {} when adding, the
  // section when editing. Two forms used to stack up at the top of the page.
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const { items: sections, loaded, error, reload } = useList('/api/sections', {}, 'Failed to load sections')
  const { notice, succeed, fail, clear } = useNotice()

  const isNew = editing && !editing.section_id

  const ordered = useMemo(() => [...sections].sort(planOrder), [sections])

  // One pass over the sections, rather than four either side of the JSX.
  const totals = useMemo(
    () =>
      sections.reduce(
        (acc, s) => {
          acc.lot_count += num(s.lot_count)
          acc.available += num(s.available)
          acc.reserved += num(s.reserved)
          acc.occupied += num(s.occupied)
          return acc
        },
        { lot_count: 0, available: 0, reserved: 0, occupied: 0 }
      ),
    [sections]
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ordered.filter((s) => {
      if (q && !`${s.section_name} ${s.location || ''}`.toLowerCase().includes(q)) return false
      const free = num(s.available)
      if (filter === 'free' && free === 0) return false
      if (filter === 'full' && free > 0) return false
      if (filter === 'locked' && !s.is_locked) return false
      return true
    })
  }, [ordered, query, filter])

  const filtered = query.trim() !== '' || filter !== 'all'

  const clearFilters = () => {
    setQuery('')
    setFilter('all')
  }

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
      succeed(data.is_locked ? `Locked ${data.section_name}. Its outline and lot geometry are frozen.` : `Unlocked ${data.section_name}.`)
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
          <h3>{isNew ? 'Add Section' : `Edit ${editing.section_name}`}</h3>
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

      {loaded && !error && sections.length === 0 && (
        <EmptyState
          noun="sections"
          action={{ label: 'Add the first section', onClick: openAdd }}
        />
      )}

      {loaded && !error && sections.length > 0 && (
        <>
          <section className="dash-panel section-overview" aria-labelledby="section-overview-title">
            <h3 id="section-overview-title">Cemetery at a glance</h3>
            <div className="stat-row">
              <div className="stat-tile">
                <p className="stat-label">Sections</p>
                <p className="stat-value">{sections.length.toLocaleString()}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Plots</p>
                <p className="stat-value">{totals.lot_count.toLocaleString()}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Available</p>
                <p className="stat-value">{totals.available.toLocaleString()}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Reserved</p>
                <p className="stat-value">{totals.reserved.toLocaleString()}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-label">Occupied</p>
                <p className="stat-value">{totals.occupied.toLocaleString()}</p>
              </div>
            </div>
            <div className="section-overview-bar">
              <OccupancyBar large counts={totals} />
              <p className="cell-sub">
                {totals.lot_count > 0
                  ? `${percent(totals.occupied, totals.lot_count)} of plots occupied`
                  : 'No plots recorded yet'}
              </p>
            </div>
          </section>

          <div className="section-toolbar">
            <input
              className="search-input"
              type="search"
              aria-label="Find a section by name or location"
              placeholder="Find a section by name or location…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="map-filters" role="group" aria-label="Filter sections">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={filter === f.value ? 'chip chip--active' : 'chip'}
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="section-toolbar-count" aria-live="polite">
              {shown.length} of {sections.length}
            </span>
          </div>

          {shown.length === 0 ? (
            <EmptyState noun="sections" filtered onClear={clearFilters} />
          ) : (
            <div className="table-container section-block">
              <table className="table table--stack">
                <caption className="visually-hidden">Cemetery sections</caption>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Occupancy</th>
                    <th>Availability</th>
                    <th><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const total = num(s.lot_count)
                    return (
                      <tr key={s.section_id}>
                        <td data-label="Section">
                          <span className="section-cell">
                            <span className="section-cell-head">
                              <Link
                                to={`/admin/lots?section=${s.section_id}`}
                                className="section-name"
                                title={`Open the lot editor for ${s.section_name}`}
                              >
                                {s.section_name}
                              </Link>
                              {Boolean(s.is_locked) && <span className="mark mark--locked">Locked</span>}
                            </span>
                            {[s.location, s.description].filter(Boolean).length > 0 && (
                              <span
                                className="cell-sub section-description"
                                title={[s.location, s.description].filter(Boolean).join(' · ')}
                              >
                                {[s.location, s.description].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-label="Occupancy" className="section-plots">
                          <span className="section-plots-value">
                            <OccupancyBar counts={s} />
                            <span className="cell-sub">
                              {total.toLocaleString()} plot{total === 1 ? '' : 's'}
                              {total > 0 && ` · ${percent(num(s.occupied), total)} occupied`}
                            </span>
                          </span>
                        </td>
                        <td data-label="Availability">
                          <span className="availability">
                            <span className="availability-item">
                              <i className="swatch-dot swatch-dot--available" aria-hidden="true" />
                              <strong>{num(s.available).toLocaleString()}</strong> available
                            </span>
                            <span className="availability-item">
                              <i className="swatch-dot swatch-dot--reserved" aria-hidden="true" />
                              <strong>{num(s.reserved).toLocaleString()}</strong> reserved
                            </span>
                            <span className="availability-item">
                              <i className="swatch-dot swatch-dot--occupied" aria-hidden="true" />
                              <strong>{num(s.occupied).toLocaleString()}</strong> occupied
                            </span>
                          </span>
                        </td>
                        <td className="cell-actions">
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered && shown.length > 0 && (
            <p className="section-clear">
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
